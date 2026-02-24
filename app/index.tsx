import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  Alert,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const [facing, setFacing] = useState<CameraType>('back');
  const [overlayUri, setOverlayUri] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [flash, setFlash] = useState<boolean>(false);
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [showSlider, setShowSlider] = useState<boolean>(true);

  // Overlay position and scale
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  // Track current values for gesture continuity
  const lastOffset = useRef({ x: 0, y: 0 });
  const lastScale = useRef(1);

  const shutterScale = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const savedBadgeAnim = useRef(new Animated.Value(0)).current;

  const sliderWidth = SCREEN_WIDTH - 80;

  useEffect(() => {
    console.log('[CameraScreen] mounted');
    return () => console.log('[CameraScreen] unmounted');
  }, []);

  // Drag gesture for overlay repositioning
  const dragGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.setValue(lastOffset.current.x + e.translationX);
      translateY.setValue(lastOffset.current.y + e.translationY);
    })
    .onEnd((e) => {
      lastOffset.current = {
        x: lastOffset.current.x + e.translationX,
        y: lastOffset.current.y + e.translationY,
      };
    });

  // Pinch gesture for overlay scaling
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.setValue(lastScale.current * e.scale);
    })
    .onEnd((e) => {
      lastScale.current = lastScale.current * e.scale;
    });

  const composedGesture = Gesture.Simultaneous(dragGesture, pinchGesture);

  const resetOverlayTransform = useCallback(() => {
    translateX.setValue(0);
    translateY.setValue(0);
    scale.setValue(1);
    lastOffset.current = { x: 0, y: 0 };
    lastScale.current = 1;
  }, []);

  const pickOverlayImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        setOverlayUri(result.assets[0].uri);
        resetOverlayTransform();
        setShowSlider(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, [resetOverlayTransform]);

  const removeOverlay = useCallback(() => {
    setOverlayUri(null);
    resetOverlayTransform();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [resetOverlayTransform]);

  const toggleFacing = useCallback(() => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const toggleFlash = useCallback(() => {
    setFlash((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const showSavedBadge = useCallback(() => {
    savedBadgeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(savedBadgeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(savedBadgeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [savedBadgeAnim]);

  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || isCapturing) return;

    setIsCapturing(true);

    Animated.sequence([
      Animated.timing(shutterScale, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(shutterScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        shutterSound: true,
      });

      if (photo?.uri) {
        if (Platform.OS !== 'web') {
          if (!mediaPermission?.granted) {
            const perm = await requestMediaPermission();
            if (!perm.granted) {
              Alert.alert('Permission needed', 'Please grant media library access to save photos.');
              setIsCapturing(false);
              return;
            }
          }
          await MediaLibrary.saveToLibraryAsync(photo.uri);
          showSavedBadge();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          showSavedBadge();
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [cameraReady, isCapturing, mediaPermission, requestMediaPermission, shutterScale, flashAnim, showSavedBadge]);

  const onSliderTouch = useCallback(
    (evt: { nativeEvent: { locationX: number } }) => {
      const x = evt.nativeEvent.locationX;
      const newOpacity = Math.max(0, Math.min(1, x / sliderWidth));
      setOverlayOpacity(newOpacity);
    },
    [sliderWidth]
  );

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <StatusBar style="light" />
        <View style={styles.permissionContent}>
          <View style={styles.permissionIconWrap}>
            <Ionicons name="camera" size={48} color={Colors.accent} />
          </View>
          <Text style={styles.permissionTitle}>Camera Access</Text>
          <Text style={styles.permissionDescription}>
            This app needs camera access to take photos. Your overlay images are displayed on top of
            the camera preview, but photos are saved without the overlay.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
            activeOpacity={0.8}
          >
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="light" />

      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        enableTorch={flash}
        onCameraReady={() => setCameraReady(true)}
        onMountError={(e) => console.error('[CameraScreen] mount error:', e.message)}
      />

      {overlayUri && (
        <GestureDetector gesture={composedGesture}>
          <Animated.Image
            source={{ uri: overlayUri }}
            style={[
              styles.overlay,
              {
                opacity: overlayOpacity,
                transform: [
                  { translateX },
                  { translateY },
                  { scale },
                ],
              },
            ]}
            resizeMode="contain"
          />
        </GestureDetector>
      )}

      <Animated.View
        style={[styles.flashOverlay, { opacity: flashAnim }]}
        pointerEvents="none"
      />

      <Animated.View
        style={[
          styles.savedBadge,
          {
            top: insets.top + 60,
            opacity: savedBadgeAnim,
            transform: [
              {
                translateY: savedBadgeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <Ionicons name="download-outline" size={16} color={Colors.success} />
        <Text style={styles.savedBadgeText}>Saved to Gallery</Text>
      </Animated.View>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.topButton} onPress={toggleFlash} activeOpacity={0.7}>
          <Ionicons
            name={flash ? 'flash' : 'flash-off'}
            size={22}
            color={flash ? Colors.accent : Colors.whiteAlpha60}
          />
        </TouchableOpacity>

        {overlayUri && (
          <TouchableOpacity style={styles.topButton} onPress={removeOverlay} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={Colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 16 }]}>
        {overlayUri && showSlider && (
          <View style={styles.sliderSection}>
            <View style={styles.sliderLabelRow}>
              <Ionicons name="sunny-outline" size={14} color={Colors.whiteAlpha60} />
              <Text style={styles.sliderLabel}>Overlay Opacity</Text>
              <Text style={styles.sliderValue}>{Math.round(overlayOpacity * 100)}%</Text>
            </View>
            <View
              style={[styles.sliderTrack, { width: sliderWidth }]}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={onSliderTouch}
              onResponderMove={onSliderTouch}
            >
              <View style={[styles.sliderFill, { width: `${overlayOpacity * 100}%` }]} />
              <View style={[styles.sliderThumb, { left: overlayOpacity * sliderWidth - 10 }]} />
            </View>
          </View>
        )}

        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.sideButton} onPress={pickOverlayImage} activeOpacity={0.7}>
            <View style={styles.sideButtonInner}>
              {overlayUri ? (
                <Image source={{ uri: overlayUri }} style={styles.overlayThumbnail} />
              ) : (
                <Ionicons name="image-outline" size={24} color={Colors.white} />
              )}
            </View>
            <Text style={styles.sideButtonLabel}>{overlayUri ? 'Change' : 'Overlay'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={capturePhoto}
            activeOpacity={0.9}
            disabled={isCapturing || !cameraReady}
          >
            <Animated.View
              style={[
                styles.shutterOuter,
                { transform: [{ scale: shutterScale }] },
                (!cameraReady || isCapturing) && styles.shutterDisabled,
              ]}
            >
              <View style={styles.shutterInner}>
                {isCapturing ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : null}
              </View>
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.sideButton} onPress={toggleFacing} activeOpacity={0.7}>
            <View style={styles.sideButtonInner}>
              <Ionicons name="camera-reverse-outline" size={24} color={Colors.white} />
            </View>
            <Text style={styles.sideButtonLabel}>Flip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  permissionContent: {
    alignItems: 'center',
  },
  permissionIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.whiteAlpha10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  permissionDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  permissionButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.background,
    letterSpacing: -0.3,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  sliderSection: {
    marginBottom: 24,
    alignItems: 'center',
  },
  sliderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sliderLabel: {
    fontSize: 13,
    color: Colors.whiteAlpha60,
    fontWeight: '500' as const,
    flex: 1,
  },
  sliderValue: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '600' as const,
    minWidth: 40,
    textAlign: 'right',
  },
  sliderTrack: {
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    justifyContent: 'center',
    overflow: 'visible',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: 'rgba(232,168,56,0.25)',
    borderRadius: 16,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.sliderThumb,
    borderWidth: 2,
    borderColor: Colors.white,
    top: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  sideButton: {
    alignItems: 'center',
    gap: 6,
    width: 64,
  },
  sideButtonInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  sideButtonLabel: {
    fontSize: 11,
    color: Colors.whiteAlpha60,
    fontWeight: '500' as const,
  },
  overlayThumbnail: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  savedBadge: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 20,
  },
  savedBadgeText: {
    fontSize: 14,
    color: Colors.success,
    fontWeight: '600' as const,
  },
});