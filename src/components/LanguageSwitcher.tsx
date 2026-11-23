// umuv-rider/src/components/LanguageSwitcher.tsx

import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme';

const LANGUAGES = [
  { code: 'en',  label: 'English',  flag: '🇬🇧' },
  { code: 'tn',  label: 'Setswana', flag: '🇧🇼' },
  { code: 'kck', label: 'Kalanga',  flag: '🇧🇼' },
];

export function LanguageSwitcher() {
  const { language, setLanguage } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const handleSelect = async (code: string) => {
    await setLanguage(code);
    setShowModal(false);
  };

  const activeLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <>
      <TouchableOpacity onPress={() => setShowModal(true)} style={styles.button}>
        <Text style={styles.buttonText}>
          {activeLang.flag} {activeLang.code.toUpperCase()}
        </Text>
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Language</Text>

            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => handleSelect(lang.code)}
                style={[styles.langRow, language === lang.code && styles.langRowActive]}
              >
                <Text style={styles.flag}>{lang.flag}</Text>
                <Text style={[styles.langText, language === lang.code && styles.langTextActive]}>
                  {lang.label}
                </Text>
                {language === lang.code && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.umuv} />
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtn}>
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 100 },
  buttonText: { color: 'white', fontSize: 12, fontWeight: '800' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: 'white', borderRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 16 },
  langRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: radius.md, marginBottom: 8, backgroundColor: colors.slate50 },
  langRowActive: { backgroundColor: colors.umuvLight, borderWidth: 1, borderColor: colors.umuv },
  flag: { fontSize: 20, marginRight: 12 },
  langText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  langTextActive: { color: colors.umuvDark, fontWeight: '800' },
  closeBtn: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  closeText: { color: colors.slate500, fontWeight: '700', fontSize: 14 },
});