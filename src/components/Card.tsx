import { View, ViewStyle } from 'react-native';
import { colors, radius, shadows } from '../theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{
      backgroundColor: 'white',
      borderRadius: radius.xl,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.slate200,
    }, shadows.card, style]}>
      {children}
    </View>
  );
}