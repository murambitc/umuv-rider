import { View, Text } from 'react-native';
import { colors } from '../theme';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: { box: 28, font: 16 }, md: { box: 36, font: 20 }, lg: { box: 48, font: 26 } }[size];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{
        width: dims.box, height: dims.box, borderRadius: dims.box * 0.28,
        backgroundColor: colors.umuv, alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ color: 'white', fontWeight: '800', fontSize: dims.font * 0.6 }}>u</Text>
      </View>
      <Text style={{ fontSize: dims.font, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
        uMuv
      </Text>
    </View>
  );
}