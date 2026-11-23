import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import { getEcho } from '../../../lib/echo';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../lib/api';
import { colors, spacing, radius } from '../../../theme';

const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function CallScreen() {
  const { id, otherUserId, isCaller } = useLocalSearchParams<{ id: string, otherUserId: string, isCaller: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [callState, setCallState] = useState<'ringing' | 'connected' | 'ended'>('ringing');
  const peerConnection = useRef(new RTCPeerConnection(configuration));
  const localStream = useRef<any>(null);
  const echoRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    const start = async () => {
      try {
        // 1. Get Microphone
        const stream = await mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) return;
        localStream.current = stream;
        stream.getTracks().forEach((track: any) => peerConnection.current.addTrack(track, stream));

        // 2. Handle ICE Candidates
        peerConnection.current.onicecandidate = (event: any) => {
          if (event.candidate) {
            api.sendCallSignal(Number(id), Number(otherUserId), 'candidate', event.candidate);
          }
        };

        // 3. Listen to Echo
        echoRef.current = await getEcho();
        const channel = echoRef.current.private(`user.${user.id}`);
        
        channel.listen('.CallSignal', async (event: any) => {
          if (event.senderId === user.id) return; // Ignore own signals

          if (event.signal === 'offer') {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(event.payload));
            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            api.sendCallSignal(Number(id), Number(otherUserId), 'answer', answer);
            setCallState('connected');
          } 
          else if (event.signal === 'answer') {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(event.payload));
            setCallState('connected');
          } 
          else if (event.signal === 'candidate') {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(event.payload));
          }
          else if (event.signal === 'reject') {
            setCallState('ended');
            Alert.alert('Call Ended', 'The other party disconnected.');
            setTimeout(() => router.back(), 1500);
          }
        });

        // 4. If Caller, create offer
        if (isCaller === 'true') {
          const offer = await peerConnection.current.createOffer();
          await peerConnection.current.setLocalDescription(offer);
          api.sendCallSignal(Number(id), Number(otherUserId), 'offer', offer);
        }

      } catch (err: any) {
        Alert.alert('Call Error', 'Could not access microphone or connect.');
        router.back();
      }
    };

    start();

    return () => {
      isMounted = false;
      if (localStream.current) localStream.current.getTracks().forEach((t: any) => t.stop());
      peerConnection.current.close();
      if (echoRef.current) echoRef.current.disconnect();
    };
  }, []);

  const endCall = () => {
    api.sendCallSignal(Number(id), Number(otherUserId), 'reject');
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ marginBottom: 60, alignItems: 'center' }}>
        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.umuv, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Text style={{ fontSize: 40 }}>👤</Text>
        </View>
        <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 8 }}>
          {callState === 'ringing' ? 'Calling...' : 'In Call'}
        </Text>
        <Text style={{ color: colors.slate400, fontSize: 16 }}>
          {callState === 'ringing' ? 'Waiting for answer' : 'Connected securely'}
        </Text>
      </View>

      <View style={{ position: 'absolute', bottom: 60, flexDirection: 'row', gap: 20 }}>
        <TouchableOpacity onPress={endCall} style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', shadowColor: colors.red, shadowOpacity: 0.4, shadowRadius: 10, elevation: 5 }}>
          <Text style={{ color: 'white', fontSize: 24 }}>✕</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}