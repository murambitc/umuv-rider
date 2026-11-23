// umuv-rider/src/app/index.tsx

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  useWindowDimensions,
  Animated,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, shadows } from '../theme';
import { Button } from '../components/Button';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

// Maps common calling codes to ISO 3166-1 alpha-2 region codes for Intl.DisplayNames
const DIAL_CODE_TO_REGION: Record<string, string> = {
  '1': 'US',
  '20': 'EG',
  '27': 'ZA',
  '33': 'FR',
  '44': 'GB',
  '49': 'DE',
  '91': 'IN',
  '234': 'NG',
  '254': 'KE',
  '255': 'TZ',
  '256': 'UG',
  '260': 'ZM',
  '263': 'ZW',
  '264': 'NA',
  '265': 'MW',
  '266': 'LS',
  '267': 'BW',
  '268': 'SZ',
  '258': 'MZ',
};

function getLocalizedRegionName(dialCode: string, locale: string): string | null {
  const regionCode = DIAL_CODE_TO_REGION[dialCode];
  if (!regionCode) return null;

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      const displayNames = new Intl.DisplayNames([locale || 'en'], { type: 'region' });
      return displayNames.of(regionCode) ?? regionCode;
    }
  } catch {
    // Fallback if Intl.DisplayNames is unavailable in an older runtime
  }
  return regionCode;
}

function formatTwoDigits(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale || 'en', {
      minimumIntegerDigits: 2,
      useGrouping: false,
    }).format(value);
  } catch {
    return value < 10 ? `0${value}` : String(value);
  }
}

export default function RiderLoginScreen() {
  const [dialCode, setDialCode] = useState('267');
  const [localPhone, setLocalPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [focusedField, setFocusedField] = useState<'code' | 'phone' | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.94)).current;
  const otpInputRef = useRef<TextInput>(null);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading, signIn, language } = useAuth();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTablet = windowWidth > 768;

  const activeLocale = language || 'en';
  const cleanDialCode = dialCode.replace(/\D/g, '');
  const cleanLocalPhone = localPhone.replace(/\D/g, '');
  const fullPhone = `${cleanDialCode}${cleanLocalPhone}`;
  const isPhoneValid =
    cleanDialCode.length >= 1 && cleanLocalPhone.length >= 6 && fullPhone.length >= 8;

  const regionLabel = useMemo(
    () => getLocalizedRegionName(cleanDialCode, activeLocale),
    [cleanDialCode, activeLocale]
  );

  // Splash animation & auth redirect
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 7,
      tension: 40,
      useNativeDriver: true,
    }).start();

    if (authLoading) return;
    if (user) {
      router.replace('/(tabs)/home');
      return;
    }

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }).start(() => setShowSplash(false));
    }, 2200);

    return () => clearTimeout(timer);
  }, [authLoading, user, fadeAnim, scaleAnim]);

  // OTP resend countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  const handleDialCodeChange = (text: string) => {
    setDialCode(text.replace(/\D/g, '').slice(0, 4));
  };

  const handlePhoneChange = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('+')) {
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length > 7) {
        const inferredCodeLen = digits.length >= 11 ? 3 : digits.length === 10 ? 2 : 1;
        setDialCode(digits.slice(0, inferredCodeLen));
        setLocalPhone(digits.slice(inferredCodeLen, inferredCodeLen + 12));
        return;
      }
    }
    setLocalPhone(trimmed.replace(/\D/g, '').slice(0, 12));
  };

  const requestOtp = async () => {
    if (!isPhoneValid) {
      Alert.alert(t('invalid_phone'), t('invalid_phone_msg'));
      return;
    }
    setLoading(true);
    try {
      await api.requestOtp(fullPhone);
      setCode('');
      setStep('otp');
      setCountdown(60);
      setTimeout(() => otpInputRef.current?.focus(), 150);
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (countdown > 0) return;
    setIsResending(true);
    try {
      await api.requestOtp(fullPhone);
      setCountdown(60);
      Alert.alert(t('saved'), t('send_code'));
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setIsResending(false);
    }
  };

  const verify = async (otpValue = code) => {
    if (otpValue.length !== 6) {
      Alert.alert(t('invalid_otp'), t('invalid_otp_msg'));
      return;
    }
    setLoading(true);
    try {
      const result = await api.verifyOtp(fullPhone, otpValue);
      await signIn(result.token, result.user);
      router.replace('/(tabs)/home');
    } catch (e: any) {
      Alert.alert(t('error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
    if (cleaned.length === 6 && !loading) {
      verify(cleaned);
    }
  };

  if (showSplash) {
    return (
      <View style={styles.splashContainer}>
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
            alignItems: 'center',
          }}
        >
          <Image
            source={require('../../assets/images/logo.png')}
            style={{ width: 220, height: 80 }}
            resizeMode="contain"
          />
          <View style={styles.splashBadge}>
            <Text style={styles.splashBadgeText}>{t('rider_app_badge')}</Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* HERO HEADER */}
          <View
            style={{
              height: isTablet ? windowHeight * 0.38 : windowHeight * 0.42,
              width: '100%',
              backgroundColor: colors.amber,
              position: 'relative',
            }}
          >
            <Image
              source={require('../../assets/images/login-bg.png')}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
            <View style={styles.heroScrim} />

            {/* Top Bar */}
            <View
              style={{
                position: 'absolute',
                top: insets.top + spacing.sm,
                left: spacing.lg,
                right: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {step === 'otp' ? (
                <TouchableOpacity
                  onPress={() => {
                    setStep('phone');
                    setCode('');
                  }}
                  style={styles.backButton}
                  hitSlop={10}
                >
                  <Ionicons name="arrow-back" size={20} color="white" />
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <LanguageSwitcher />
            </View>
          </View>

          {/* FORM SHEET */}
          <View
            style={[
              styles.sheetContainer,
              {
                paddingBottom: Math.max(insets.bottom + spacing.lg, 36),
                maxWidth: isTablet ? 520 : '100%',
                alignSelf: 'center',
                width: '100%',
              },
            ]}
          >
            {/* App Pill Badge */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={styles.pillBadge}>
                <Ionicons name="car-sport" size={13} color={colors.amber} />
                <Text style={styles.pillBadgeText}>{t('rider_app_badge')}</Text>
              </View>
            </View>

            {/* Titles */}
            <Text style={styles.title}>
              {step === 'phone' ? t('login_title_welcome') : t('login_title_otp')}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'phone'
                ? t('login_sub_phone')
                : t('login_sub_otp', { phone: `+${fullPhone}` })}
            </Text>

            {step === 'phone' ? (
              <>
                {/* Editable International Dial Code + Phone Input */}
                <View
                  style={[
                    styles.phoneFieldContainer,
                    focusedField !== null && styles.inputFocused,
                  ]}
                >
                  <View style={styles.countryPrefix}>
                    <Ionicons name="globe-outline" size={16} color={colors.slate600} />
                    <Text style={styles.plusSign}>+</Text>
                    <TextInput
                      value={dialCode}
                      onChangeText={handleDialCodeChange}
                      onFocus={() => setFocusedField('code')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="267"
                      placeholderTextColor={colors.slate400}
                      keyboardType="number-pad"
                      maxLength={4}
                      style={styles.dialCodeInput}
                    />
                  </View>

                  <TextInput
                    value={localPhone}
                    onChangeText={handlePhoneChange}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="71234567"
                    placeholderTextColor={colors.slate400}
                    keyboardType="phone-pad"
                    maxLength={12}
                    autoFocus
                    style={styles.phoneInput}
                  />

                  {localPhone.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setLocalPhone('')}
                      hitSlop={10}
                      style={{ paddingRight: 12 }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={colors.slate400}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {regionLabel && (
                  <View style={styles.regionHintRow}>
                    <Ionicons name="location-outline" size={13} color={colors.slate500} />
                    <Text style={styles.regionHintText}>
                      {regionLabel} (+{cleanDialCode})
                    </Text>
                  </View>
                )}

                <Button
                  title={t('send_code')}
                  onPress={requestOtp}
                  loading={loading}
                  disabled={!isPhoneValid}
                />
              </>
            ) : (
              <>
                {/* 6-Box OTP Input */}
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => otpInputRef.current?.focus()}
                  style={styles.otpBoxesRow}
                >
                  {[0, 1, 2, 3, 4, 5].map((index) => {
                    const digit = code[index] ?? '';
                    const isActive = code.length === index;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.otpBox,
                          digit ? styles.otpBoxFilled : null,
                          isActive ? styles.otpBoxActive : null,
                        ]}
                      >
                        <Text style={styles.otpDigit}>{digit}</Text>
                      </View>
                    );
                  })}
                </TouchableOpacity>

                {/* Hidden TextInput for keyboard & SMS autofill */}
                <TextInput
                  ref={otpInputRef}
                  value={code}
                  onChangeText={handleCodeChange}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={6}
                  autoFocus
                  style={styles.hiddenOtpInput}
                />

                <Button
                  title={t('verify_code')}
                  onPress={() => verify()}
                  loading={loading}
                  disabled={code.length !== 6}
                  variant="secondary"
                />

                {/* Resend & Change Number Actions */}
                <View style={styles.otpFooterActions}>
                  {countdown > 0 ? (
                    <View style={styles.countdownRow}>
                      <Ionicons
                        name="time-outline"
                        size={15}
                        color={colors.slate500}
                      />
                      <Text style={styles.countdownText}>
                        {t('resend_in')} {formatTwoDigits(0, activeLocale)}:
                        {formatTwoDigits(countdown, activeLocale)}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={resendOtp}
                      disabled={isResending}
                      style={{ paddingVertical: 6 }}
                    >
                      {isResending ? (
                        <ActivityIndicator size="small" color={colors.umuv} />
                      ) : (
                        <Text style={styles.resendLink}>{t('resend_code')}</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => {
                      setStep('phone');
                      setCode('');
                    }}
                    style={{ paddingVertical: 8, marginTop: 4 }}
                  >
                    <Text style={styles.changeNumberText}>
                      {t('use_different_number')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Terms Footer */}
            <View style={{ flex: 1, justifyContent: 'flex-end', marginTop: 28 }}>
              <Text style={styles.termsText}>{t('terms_accept')}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashBadge: {
    marginTop: 14,
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 100,
  },
  splashBadgeText: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.14)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: 'white',
    marginTop: -28,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    ...shadows.card,
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
  },
  pillBadgeText: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.slate500,
    lineHeight: 20,
    marginBottom: 24,
  },
  phoneFieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.slate50,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    marginBottom: 10,
    overflow: 'hidden',
  },
  inputFocused: {
    borderColor: colors.ink,
    backgroundColor: 'white',
  },
  countryPrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: colors.slate200,
    backgroundColor: colors.slate100,
  },
  plusSign: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  dialCodeInput: {
    minWidth: 36,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.5,
  },
  regionHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  regionHintText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.slate500,
  },
  otpBoxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
  },
  otpBox: {
    flex: 1,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.slate50,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: {
    backgroundColor: 'white',
    borderColor: colors.ink,
  },
  otpBoxActive: {
    borderColor: colors.amberDark,
    backgroundColor: colors.amberLight,
  },
  otpDigit: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
  },
  hiddenOtpInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  otpFooterActions: {
    marginTop: 18,
    alignItems: 'center',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  countdownText: {
    color: colors.slate500,
    fontSize: 13,
    fontWeight: '600',
  },
  resendLink: {
    color: colors.umuv,
    fontSize: 14,
    fontWeight: '800',
  },
  changeNumberText: {
    color: colors.slate500,
    fontSize: 13,
    fontWeight: '700',
  },
  termsText: {
    textAlign: 'center',
    color: colors.slate400,
    fontSize: 12,
    lineHeight: 18,
  },
});