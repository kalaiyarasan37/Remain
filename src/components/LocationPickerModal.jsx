import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
   View, Text, StyleSheet, Modal, TouchableOpacity,
   ActivityIndicator, Platform, PermissionsAndroid
} from 'react-native';
import { WebView } from 'react-native-webview';
import axios from 'axios';
import Geolocation from '@react-native-community/geolocation';

const LocationPickerModal = ({ visible, onClose, onConfirm }) => {
   const currentCenter = useRef({
      latitude: 28.6139,
      longitude: 77.2090,
   });
   
   const [initialCenter, setInitialCenter] = useState(null);
   const [address, setAddress] = useState('');
   const [loadingAddress, setLoadingAddress] = useState(false);

   useEffect(() => {
      if (visible) {
         setInitialCenter(null);
         setAddress('');
         requestLocation();
      }
   }, [visible]);

   const requestLocation = async () => {
      try {
         if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
               PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
               console.warn('Location permission denied');
               setInitialCenter(currentCenter.current);
               return;
            }
         }
         
         Geolocation.getCurrentPosition(
            (position) => {
               const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
               currentCenter.current = coords;
               setInitialCenter(coords);
            },
            (error) => {
               console.warn('High accuracy GPS timed out, trying Wi-Fi/Cell location...');
               // GPS hardware lock failed (very common indoors or on emulators). 
               // Fallback to low accuracy (Wi-Fi/Network based) which is fast and rarely times out.
               Geolocation.getCurrentPosition(
                  (pos) => {
                     const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                     currentCenter.current = coords;
                     setInitialCenter(coords);
                  },
                  (err) => {
                     console.warn('Low accuracy location failed:', err);
                     setInitialCenter(currentCenter.current);
                  },
                  { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
               );
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
         );
      } catch (err) {
         console.warn(err);
         setInitialCenter(currentCenter.current);
      }
   };

   const fetchAddress = async (lat, lon) => {
      setLoadingAddress(true);
      try {
         const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: { lat, lon, format: 'json', addressdetails: 1 },
            headers: { 'User-Agent': 'RemainApp/1.0' }
         });
         
         if (response.data?.display_name) {
            setAddress(response.data.display_name);
         } else {
            setAddress('Unknown location');
         }
      } catch (error) {
         console.error('Nominatim Error:', error);
         setAddress('Could not fetch address');
      } finally {
         setLoadingAddress(false);
      }
   };

   const onMessage = (event) => {
      try {
         const data = JSON.parse(event.nativeEvent.data);
         if (data.type === 'REGION_CHANGE') {
            currentCenter.current = { latitude: data.lat, longitude: data.lon };
            fetchAddress(data.lat, data.lon);
         }
      } catch (e) {
         console.log('WebView message error:', e);
      }
   };

   const webViewSource = useMemo(() => {
      if (!initialCenter) return null;

      const mapHtml = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <style>
              body { padding: 0; margin: 0; background-color: #e5e5e5; }
              #map { width: 100vw; height: 100vh; }
              .center-marker {
                  position: absolute;
                  top: 50%;
                  left: 50%;
                  transform: translate(-50%, -100%);
                  z-index: 1000;
                  font-size: 42px;
                  pointer-events: none;
                  text-shadow: 0px 2px 3px rgba(0,0,0,0.3);
              }
              .leaflet-control-attribution { display: none !important; }
          </style>
      </head>
      <body>
          <div id="map"></div>
          <div class="center-marker">📍</div>
          
          <script>
              const map = L.map('map', { 
                  zoomControl: false, 
                  attributionControl: false 
              }).setView([${currentCenter.current.latitude}, ${currentCenter.current.longitude}], 15);
              
              L.tileLayer('https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
                  maxZoom: 19
              }).addTo(map);

              let timeoutId;
              
              map.on('moveend', function() {
                  clearTimeout(timeoutId);
                  timeoutId = setTimeout(() => {
                      const center = map.getCenter();
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'REGION_CHANGE',
                          lat: center.lat,
                          lon: center.lng
                      }));
                  }, 1200); // 1.2s debounce to strictly respect Nominatim's 1-per-second limit
              });

              // Initial load trigger
              setTimeout(() => {
                 const center = map.getCenter();
                 window.ReactNativeWebView.postMessage(JSON.stringify({
                     type: 'REGION_CHANGE',
                     lat: center.lat,
                     lon: center.lng
                 }));
              }, 800);
          </script>
      </body>
      </html>
      `;
      return { html: mapHtml };
   }, [initialCenter]); // Recreate webview source ONLY when initialCenter changes from null to coordinates

   return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
         <View style={styles.container}>
            <View style={styles.header}>
               <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                  <Text style={styles.headerBtnText}>Cancel</Text>
               </TouchableOpacity>
               <Text style={styles.headerTitle}>Pick Location</Text>
               <View style={{ width: 60 }} />
            </View>

            <View style={styles.mapContainer}>
               {!initialCenter ? (
                  <View style={styles.loadingContainer}>
                     <ActivityIndicator size="large" color="#007AFF" />
                     <Text style={styles.loadingText}>Fetching current location...</Text>
                  </View>
               ) : (
                  <WebView
                     source={webViewSource}
                     style={{ flex: 1 }}
                     onMessage={onMessage}
                     scrollEnabled={false}
                     bounces={false}
                     showsHorizontalScrollIndicator={false}
                     showsVerticalScrollIndicator={false}
                     androidLayerType="hardware"
                  />
               )}
            </View>

            <View style={styles.footer}>
               <View style={styles.addressBox}>
                  {loadingAddress ? (
                     <ActivityIndicator color="#000" size="small" />
                  ) : (
                     <Text style={styles.addressText} numberOfLines={2}>
                        {address || 'Move map to select location'}
                     </Text>
                  )}
               </View>
               
               <TouchableOpacity 
                  style={[styles.confirmBtn, (!address || loadingAddress) && styles.disabledBtn]}
                  onPress={() => onConfirm(address, currentCenter.current.latitude, currentCenter.current.longitude)}
                  disabled={!address || loadingAddress}
               >
                  <Text style={styles.confirmBtnText}>Confirm Location</Text>
               </TouchableOpacity>
            </View>
         </View>
      </Modal>
   );
};

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: '#f5f5f5' },
   header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: 16, backgroundColor: '#007AFF',
      paddingTop: Platform.OS === 'ios' ? 50 : 20,
   },
   headerButton: { padding: 8 },
   headerBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
   headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
   mapContainer: { flex: 1 },
   loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
   loadingText: { marginTop: 12, fontSize: 16, color: '#666' },
   footer: {
      padding: 20, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee',
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 10,
   },
   addressBox: {
      backgroundColor: '#f9f9f9', padding: 16, borderRadius: 12, marginBottom: 16,
      minHeight: 60, justifyContent: 'center', borderWidth: 1, borderColor: '#eee',
   },
   addressText: { color: '#333', fontSize: 15, fontWeight: '500', textAlign: 'center' },
   confirmBtn: { backgroundColor: '#007AFF', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
   disabledBtn: { opacity: 0.6 },
   confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default LocationPickerModal;
