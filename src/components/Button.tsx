import { TouchableOpacity, Text, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, radius, shadows } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'amber' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const palette = {
    primary:   { bg: colors.umuv,   text: 'white' },
    secondary: { bg: colors.market, text: 'white' },
    amber:     { bg: colors.amber,  text: colors.ink },
    ghost:     { bg: 'transparent', text: colors.umuv },
  }[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[{
        backgroundColor: palette.bg,
        borderRadius: radius.lg,
        paddingVertical: 16,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }, variant === 'primary' && shadows.button, style]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={{ color: palette.text, fontWeight: '700', fontSize: 16 }}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}