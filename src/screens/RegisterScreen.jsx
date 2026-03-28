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
import { sendOtp, verifyOtp as apiVerifyOtp, checkMobile } from '../services/ApiService';

// ─────────────────────────────────────────────
// BACKEND HOOK-UP NOTES:
//   handleSendOtp   → POST /auth/register/send-otp { name, phone }
//                     If 409 / { exists: true } → alert + go to Login
//   handleVerifyOtp → POST /auth/register/verify   { name, phone, otp }
//                     On success → save user from response, navigate Home
// ─────────────────────────────────────────────

const COUNTRY_CODE = '+91';

const RegisterScreen = ({ navigation, route }) => {
   // Phone pre-filled if redirected from LoginScreen
   const prefillPhone = route?.params?.phone || '';

   const [name, setName] = useState('');
   const [phone, setPhone] = useState(prefillPhone);
   const [otp, setOtp] = useState(['', '', '', '', '', '']);
   const [step, setStep] = useState('details'); // 'details' | 'otp'
   const [loading, setLoading] = useState(false);
   const [generatedOtp, setGeneratedOtp] = useState('');

   const otpRefs = [
      useRef(), useRef(), useRef(),
      useRef(), useRef(), useRef(),
   ];

   // ── Send OTP ──────────────────────────────
   const handleSendOtp = async () => {
      if (!name.trim()) {
         Alert.alert('Name Required', 'Please enter your full name.');
         return;
      }
      if (phone.length !== 10) {
         Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
         return;
      }
      setLoading(true);
      try {
         // Check if mobile already exists before sending OTP
         const check = await checkMobile(phone);
         if (check.exists) {
            setLoading(false);
            setTimeout(() => {
               Alert.alert(
                  'Already Registered',
                  'An account with this number already exists. Please sign in.',
                  [
                     { text: 'Cancel', style: 'cancel' },
                     { text: 'Sign In', onPress: () => navigation.navigate('Login', { phone }) },
                  ],
               );
            }, 100);
            return;
         }

         await sendOtp(name.trim(), phone);
         // { message: 'OTP sent successfully' }
         setLoading(false);
         setStep('otp');
      } catch (err) {
         setLoading(false);
         // Backend returns error if user already exists
         setTimeout(() => {
            Alert.alert(
               'Already Registered',
               'An account with this number already exists. Please sign in.',
               [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign In', onPress: () => navigation.navigate('Login', { phone }) },
               ],
            );
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

   // ── Verify OTP & Create Account ───────────
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
      } catch (err) {
         setLoading(false);
         setTimeout(() => {
            Alert.alert('Wrong OTP', err.message || 'The OTP you entered is incorrect.');
         }, 100);
      }
   };

   const handleResend = () => {
      setOtp(['', '', '', '', '', '']);
      setStep('details');
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
                  {step === 'details'
                     ? 'Create your account to get started'
                     : `Enter the OTP sent to ${COUNTRY_CODE} ${phone}`}
               </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
               {step === 'details' ? (
                  <>
                     <Text style={styles.label}>Full Name</Text>
                     <TextInput
                        style={styles.input}
                        placeholder="Enter your full name"
                        value={name}
                        onChangeText={setName}
                        placeholderTextColor={Colors.textLight}
                        autoFocus
                        returnKeyType="next"
                     />

                     <Text style={styles.label}>Mobile Number</Text>
                     <TextInput
                        style={styles.input}
                        placeholder="Enter 10-digit mobile number"
                        keyboardType="phone-pad"
                        maxLength={10}
                        value={phone}
                        onChangeText={text => setPhone(text.replace(/[^0-9]/g, ''))}
                        placeholderTextColor={Colors.textLight}
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
                        onPress={() => navigation.navigate('Login')}>
                        <Text style={styles.outlineButtonText}>Already have an account? Sign In</Text>
                     </TouchableOpacity>
                  </>
               ) : (
                  <>
                     {/* Details recap */}
                     <View style={styles.recapCard}>
                        <Text style={styles.recapLabel}>NAME</Text>
                        <Text style={styles.recapValue}>{name.trim()}</Text>
                        <View style={styles.recapDivider} />
                        <Text style={styles.recapLabel}>MOBILE</Text>
                        <Text style={styles.recapValue}>{COUNTRY_CODE} {phone}</Text>
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
                           : <Text style={styles.buttonText}>Verify & Create Account</Text>}
                     </TouchableOpacity>

                     <TouchableOpacity style={styles.resendButton} onPress={handleResend}>
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
   recapCard: {
      backgroundColor: Colors.background,
      borderRadius: 10,
      padding: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: Colors.border,
   },
   recapLabel: {
      fontSize: 11,
      color: Colors.textLight,
      fontWeight: '600',
      letterSpacing: 0.5,
      marginBottom: 2,
   },
   recapValue: {
      fontSize: 15,
      color: Colors.text,
      fontWeight: '500',
      marginBottom: 8,
   },
   recapDivider: {
      height: 1,
      backgroundColor: Colors.border,
      marginVertical: 6,
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

export default RegisterScreen;