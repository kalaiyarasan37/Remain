import React, { useState, useRef } from 'react';
import {
   View,
   Text,
   TextInput,
   TouchableOpacity,
   StyleSheet,
   StatusBar,
   KeyboardAvoidingView,
   Platform,
   ActivityIndicator,
   Alert,
   ScrollView,
} from 'react-native';
import Colors from '../constants/Colors';
import Storage from '../utils/Storage';
import { checkMobile, sendOtp, verifyOtp as apiVerifyOtp } from '../services/ApiService';
import NotificationService from '../services/NotificationService';
// ─────────────────────────────────────────────
// BACKEND HOOK-UP NOTES:
//   handleSendOtp  → POST /auth/send-otp   { phone }
//                    If 404 / "user not found" → alert + go to Register
//   handleVerifyOtp → POST /auth/verify-otp { phone, otp }
//                    On success → save user from response, navigate Home
// ─────────────────────────────────────────────

const COUNTRY_CODE = '+91';

const LoginScreen = ({ navigation, route }) => {
   // Pre-fill phone if redirected from RegisterScreen
   const prefillPhone = route?.params?.phone || '';

   const [phone, setPhone] = useState(prefillPhone);
   const [otp, setOtp] = useState(['', '', '', '', '', '']);
   const [step, setStep] = useState('phone'); // 'phone' | 'otp'
   const [loading, setLoading] = useState(false);
   const [generatedOtp, setGeneratedOtp] = useState('');

   const otpRefs = [
      useRef(), useRef(), useRef(),
      useRef(), useRef(), useRef(),
   ];

   // ── Send OTP ──────────────────────────────
   const handleSendOtp = async () => {
      if (phone.length !== 10) {
         Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
         return;
      }
      setLoading(true);
      try {
         // Step 1: check if mobile is registered
         const check = await checkMobile(phone);
         if (!check.exists) {
            setLoading(false);
            setTimeout(() => {
               Alert.alert(
                  'No Account Found',
                  'This number is not registered. Would you like to create a new account?',
                  [
                     { text: 'Cancel', style: 'cancel' },
                     { text: 'Register', onPress: () => navigation.navigate('Register', { phone }) },
                  ],
               );
            }, 100);
            return;
         }
         // Step 2: send OTP — login flow sends only mobile, no name needed
         await sendOtp('', phone);
         setLoading(false);
         setStep('otp');
      } catch (err) {
         setLoading(false);
         setTimeout(() => {
            Alert.alert('Error', err.message || 'Something went wrong. Please try again.');
         }, 100);
      }
   };

   // ── OTP input helpers ─────────────────────
   const handleOtpChange = (value, index) => {
      const cleaned = value.replace(/[^0-9]/g, '');
      
      // Handle paste (value is longer than 1 digit)
      if (cleaned.length > 1) {
         const pastedOtp = cleaned.slice(0, 6).split('');
         const newOtp = [...otp];
         pastedOtp.forEach((char, i) => {
            if (i < 6) newOtp[i] = char;
         });
         setOtp(newOtp);
         // Focus the last filled box or the 6th box
         const lastIndex = Math.min(pastedOtp.length - 1, 5);
         otpRefs[lastIndex].current?.focus();
         return;
      }

      const newOtp = [...otp];
      newOtp[index] = cleaned;
      setOtp(newOtp);
      if (cleaned && index < 5) {
         otpRefs[index + 1].current?.focus();
      }
   };

   const handleOtpKeyPress = (e, index) => {
      if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
         const newOtp = [...otp];
         newOtp[index - 1] = '';
         setOtp(newOtp);
         otpRefs[index - 1].current?.focus();
      }
   };

   // ── Verify OTP ────────────────────────────
   const handleVerifyOtp = async () => {
      const enteredOtp = otp.join('');
      if (enteredOtp.length !== 6) {
         Alert.alert('Invalid OTP', 'Please enter the complete 6-digit OTP.');
         return;
      }
      setLoading(true);
      try {
         const data = await apiVerifyOtp(phone, enteredOtp);
         // data = { message, token, user: { id, name, mobile_no, ... } }
         await Storage.set('user', {
            id: data.user.id,
            name: data.user.name,
            phone: data.user.mobile_no,
            token: data.token,
            countryCode: COUNTRY_CODE,
            isLoggedIn: true,
         });
         setLoading(false);
         navigation.replace('Home');
         // Schedule notifications now that user is logged in
         NotificationService.scheduleForUserId(data.user.id).catch(() => { });
      } catch (err) {
         setLoading(false);
         setTimeout(() => {
            Alert.alert('Wrong OTP', err.message || 'The OTP you entered is incorrect.');
         }, 100);
      }
   };

   const handleResend = () => {
      setOtp(['', '', '', '', '', '']);
      setStep('phone');
   };

   return (
      <KeyboardAvoidingView
         style={styles.container}
         behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
         <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
         <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Header */}
            <View style={styles.header}>
               <Text style={styles.emoji}>🔔</Text>
               <Text style={styles.title}>RemainApp</Text>
               <Text style={styles.subtitle}>
                  {step === 'phone'
                     ? 'Enter your mobile number to sign in'
                     : `Enter the OTP sent to ${COUNTRY_CODE} ${phone}`}
               </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
               {step === 'phone' ? (
                  <>
                     <Text style={styles.label}>Mobile Number</Text>
                     <TextInput
                        style={styles.input}
                        placeholder="Enter 10-digit mobile number"
                        keyboardType="phone-pad"
                        maxLength={10}
                        value={phone}
                        onChangeText={text => setPhone(text.replace(/[^0-9]/g, ''))}
                        placeholderTextColor={Colors.textLight}
                        autoFocus
                     />

                     <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleSendOtp}
                        disabled={loading}>
                        {loading
                           ? <ActivityIndicator color={Colors.white} />
                           : <Text style={styles.buttonText}>Send OTP</Text>}
                     </TouchableOpacity>

                     <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or</Text>
                        <View style={styles.dividerLine} />
                     </View>

                     <TouchableOpacity
                        style={styles.outlineButton}
                        onPress={() => navigation.navigate('Register')}>
                        <Text style={styles.outlineButtonText}>Create New Account</Text>
                     </TouchableOpacity>
                  </>
               ) : (
                  <>
                     <View style={styles.phoneChip}>
                        <Text style={styles.phoneChipText}>
                           📱  {COUNTRY_CODE} {phone}
                        </Text>
                     </View>

                     <Text style={styles.label}>Enter 6-Digit OTP</Text>
                     <View style={styles.otpContainer}>
                        {otp.map((digit, index) => (
                           <TextInput
                              key={index}
                              ref={otpRefs[index]}
                              style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
                              keyboardType="number-pad"
                              maxLength={6} // Increased to allow pasting
                              value={digit}
                              onChangeText={value => handleOtpChange(value, index)}
                              onKeyPress={e => handleOtpKeyPress(e, index)}
                              selectTextOnFocus
                           />
                        ))}
                     </View>

                     <TouchableOpacity
                        style={[
                           styles.button,
                           (loading || otp.join('').length < 6) && styles.buttonDisabled,
                        ]}
                        onPress={handleVerifyOtp}
                        disabled={loading || otp.join('').length < 6}>
                        {loading
                           ? <ActivityIndicator color={Colors.white} />
                           : <Text style={styles.buttonText}>Verify & Sign In</Text>}
                     </TouchableOpacity>

                     <TouchableOpacity style={styles.resendButton} onPress={handleResend}>
                        <Text style={styles.resendText}>← Change Number</Text>
                     </TouchableOpacity>
                  </>
               )}
            </View>
         </ScrollView>
      </KeyboardAvoidingView >
   );
};

const styles = StyleSheet.create({
   container: {
      flex: 1,
      backgroundColor: Colors.background,
      paddingHorizontal: 24,
   },
   header: {
      alignItems: 'center',
      marginTop: 80,
      marginBottom: 40,
   },
   emoji: {
      fontSize: 60,
      marginBottom: 12,
   },
   title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 8,
   },
   subtitle: {
      fontSize: 14,
      color: Colors.textLight,
      textAlign: 'center',
      lineHeight: 20,
   },
   form: {
      backgroundColor: Colors.white,
      borderRadius: 16,
      padding: 24,
      elevation: 4,
      shadowColor: Colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      marginBottom: 40,
   },
   label: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.text,
      marginBottom: 10,
   },
   phoneChip: {
      backgroundColor: Colors.background,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: Colors.border,
   },
   phoneChipText: {
      fontSize: 14,
      color: Colors.textLight,
      fontWeight: '500',
   },
   otpContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 20,
   },
   otpInput: {
      width: 44,
      height: 54,
      borderWidth: 2,
      borderColor: Colors.border,
      borderRadius: 12,
      textAlign: 'center',
      fontSize: 22,
      fontWeight: 'bold',
      color: Colors.primary,
   },
   otpInputFilled: {
      borderColor: Colors.primary,
      backgroundColor: '#F0EFFE',
   },
   button: {
      backgroundColor: Colors.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
   },
   buttonDisabled: {
      opacity: 0.5,
   },
   buttonText: {
      color: Colors.white,
      fontSize: 16,
      fontWeight: '600',
   },
   dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
      gap: 10,
   },
   dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: Colors.border,
   },
   dividerText: {
      fontSize: 12,
      color: Colors.textLight,
   },
   outlineButton: {
      borderWidth: 1.5,
      borderColor: Colors.primary,
      borderRadius: 10,
      paddingVertical: 15,
      alignItems: 'center',
   },
   outlineButtonText: {
      color: Colors.primary,
      fontSize: 15,
      fontWeight: '600',
   },
   resendButton: {
      alignItems: 'center',
      marginTop: 16,
   },
   resendText: {
      color: Colors.primary,
      fontSize: 14,
      fontWeight: '500',
   },
});

export default LoginScreen;