const otpStore = {};
const OTP_EXPIRY_MS = 5 * 60 * 1000;

exports.sendOTP = (mobile) => {
  const otp       = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;
  otpStore[mobile] = { otp, expiresAt };
  console.log(`📱 OTP for ${mobile}: ${otp}`);
  return otp;
};

exports.verifyOTP = (mobile, otp) => {
  const record = otpStore[mobile];
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    delete otpStore[mobile];
    return false;
  }
  const isValid = record.otp === otp;
  if (isValid) delete otpStore[mobile];
  return isValid;
};

exports.getOTP = (mobile) => {
  return otpStore[mobile]?.otp || null;
};
