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

const LoginScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [step, setStep] = useState('phone');
  const [loading, setLoading] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');

  const otpRefs = [useRef(), useRef(), useRef(), useRef()];

  const handleSendOtp = () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter your name.');
      return;
    }
    if (phone.length < 7) {
      Alert.alert('Invalid Number', 'Please enter a valid mobile number.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const mockOtp = Math.floor(1000 + Math.random() * 9000).toString();
      setGeneratedOtp(mockOtp);
      console.log('Mock OTP:', mockOtp);
      setLoading(false);
      setStep('otp');
      Alert.alert('OTP Sent', `OTP sent to ${countryCode} ${phone}\n(Dev mode OTP: ${mockOtp})`);
    }, 1500);
  };

  const handleOtpChange = (value, index) => {
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 3) {
      otpRefs[index + 1].current.focus();
    }
  };

  const handleOtpKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs[index - 1].current.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const enteredOtp = otp.join('');
    if (enteredOtp.length !== 4) {
      Alert.alert('Invalid OTP', 'Please enter the 4 digit OTP.');
      return;
    }
    setLoading(true);
    setTimeout(async () => {
      if (enteredOtp === generatedOtp) {
        await Storage.set('user', {
          name: name.trim(),
          phone,
          countryCode,
          isLoggedIn: true,
        });
        setLoading(false);
        navigation.replace('Home');
      } else {
        setLoading(false);
        Alert.alert('Wrong OTP', 'The OTP you entered is incorrect.');
      }
    }, 1000);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.emoji}>🔔</Text>
          <Text style={styles.title}>RemainApp</Text>
          <Text style={styles.subtitle}>
            {step === 'phone'
              ? 'Enter your details to continue'
              : `Enter the OTP sent to ${countryCode} ${phone}`}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {step === 'phone' ? (
            <>
              {/* Name Field */}
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                value={name}
                onChangeText={setName}
                placeholderTextColor={Colors.textLight}
              />

              {/* Phone Field */}
              <Text style={styles.label}>Mobile Number</Text>
              <View style={styles.phoneRow}>
                <TextInput
                  style={styles.countryCodeInput}
                  value={countryCode}
                  onChangeText={setCountryCode}
                  keyboardType="phone-pad"
                  maxLength={5}
                  placeholderTextColor={Colors.textLight}
                />
                <TextInput
                  style={styles.phoneInput}
                  placeholder="Enter mobile number"
                  keyboardType="phone-pad"
                  maxLength={15}
                  value={phone}
                  onChangeText={setPhone}
                  placeholderTextColor={Colors.textLight}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSendOtp}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Send OTP</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>Enter OTP</Text>
              <View style={styles.otpContainer}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={otpRefs[index]}
                    style={styles.otpInput}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={value => handleOtpChange(value, index)}
                    onKeyPress={e => handleOtpKeyPress(e, index)}
                  />
                ))}
              </View>
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerifyOtp}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.buttonText}>Verify OTP</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resendButton}
                onPress={() => {
                  setStep('phone');
                  setOtp(['', '', '', '']);
                }}>
                <Text style={styles.resendText}>← Change Details</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 20,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  countryCodeInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
    width: 70,
    textAlign: 'center',
    backgroundColor: Colors.background,
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  otpInput: {
    width: 60,
    height: 60,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
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