import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
} from 'react-native';
import Colors from '../constants/Colors';
import Storage from '../utils/Storage';

const SplashScreen = ({ navigation }) => {
  const fadeAnim = new Animated.Value(0);
  const scaleAnim = new Animated.Value(0.5);

  useEffect(() => {
    // Animate logo
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 10,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();

    // Check login after 2.5 seconds
    setTimeout(async () => {
      const user = await Storage.get('user');
      if (user) {
        navigation.replace('Home');
      } else {
        navigation.replace('Login');
      }
    }, 2500);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}>
        <Text style={styles.emoji}>🔔</Text>
        <Text style={styles.appName}>RemainApp</Text>
        <Text style={styles.tagline}>Your AI Reminder Assistant</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  emoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  appName: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.white,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 16,
    color: Colors.white,
    opacity: 0.8,
    marginTop: 8,
  },
});

export default SplashScreen;