import { View, Text } from 'react-native';
import { colors } from '../theme';

type Props = { name?: string; size?: number; color?: string };

export function Avatar({ name = '?', size = 40, color = colors.umuv }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: 'white', fontWeight: '700', fontSize: size * 0.4 }}>
        {initial}
      </Text>
    </View>
  );
}