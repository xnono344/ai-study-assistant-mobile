/**
 * NexusLogo — Arabic ن fused with neural network nodes + orbiting particles.
 * Original brand: never before used.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { FontFamily } from '../../constants/typography';
import { Duration } from '../../constants/animation';

export interface NexusLogoProps {
  size?: number;
  showWordmark?: boolean;
  style?: ViewStyle;
  color?: 'gold' | 'purple' | 'white';
  animated?: boolean;
}

// Hoisted once — recreating createAnimatedComponent per render is wasteful and
// semantically equivalent to creating a new component identity each time.
const Particle = Animated.createAnimatedComponent(View);

interface ParticleProps {
  index: number;
  size: number;
  mainColor: string;
  orbit: SharedValue<number>;
  glow: SharedValue<number>;
}

const ParticleView: React.FC<ParticleProps> = ({ index, size, mainColor, orbit, glow }) => {
  // useAnimatedStyle is now called at the top level of a real component — legal.
  const animatedStyle = useAnimatedStyle(() => {
    const angle = (orbit.value + (index * 120)) * (Math.PI / 180);
    const radius = size * 0.45;
    return {
      transform: [
        { translateX: Math.cos(angle) * radius },
        { translateY: Math.sin(angle) * radius },
        { scale: 0.8 + glow.value * 0.4 },
      ],
    };
  });

  const particleColor =
    index === 0 ? Colors.purple[400] : index === 1 ? mainColor : '#60A5FA';

  return (
    <Particle
      style={[
        styles.particle,
        {
          width: size * 0.08,
          height: size * 0.08,
          borderRadius: size * 0.04,
          backgroundColor: particleColor,
          shadowColor: particleColor,
          shadowRadius: 8,
        },
        animatedStyle,
      ]}
    />
  );
};

export const NexusLogo: React.FC<NexusLogoProps> = ({
  size = 64,
  showWordmark = false,
  style,
  color = 'gold',
  animated = true,
}) => {
  const glow = useSharedValue(0);
  const orbit = useSharedValue(0);

  useEffect(() => {
    if (!animated) return;
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Duration.slow, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: Duration.slow, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    orbit.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
  }, [animated, glow, orbit]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + glow.value * 0.4,
    shadowOpacity: glow.value * 0.8,
  }));

  const colorMap = {
    gold: Colors.gold.metallic,
    purple: Colors.purple[400],
    white: '#FFFFFF',
  };
  const mainColor = colorMap[color];

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.logoContainer, { width: size, height: size }]}>
        {/* Glow halo */}
        <Animated.View
          style={[
            styles.glow,
            {
              width: size * 1.5,
              height: size * 1.5,
              borderRadius: size * 0.75,
              backgroundColor: mainColor,
              shadowColor: mainColor,
              shadowRadius: size * 0.3,
            },
            glowStyle,
          ]}
        />
        {/* Main ن character */}
        <Animated.View style={glowStyle}>
          <Text
            style={[
              styles.letter,
              {
                fontSize: size * 0.7,
                color: mainColor,
                textShadowColor: mainColor,
                textShadowRadius: size * 0.1,
              },
            ]}
            allowFontScaling={false}
          >
            ن
          </Text>
        </Animated.View>
        {/* Orbiting particles */}
        {[0, 1, 2].map((i) => (
          <ParticleView
            key={i}
            index={i}
            size={size}
            mainColor={mainColor}
            orbit={orbit}
            glow={glow}
          />
        ))}
      </View>
      {showWordmark && (
        <Text style={[styles.wordmark, color === 'gold' && { color: Colors.gold.metallic }]}>
          Nexus Study
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    opacity: 0.4,
  },
  letter: {
    fontFamily: FontFamily.nexusDisplay,
    fontWeight: '700',
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
  },
  particle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -4,
    marginTop: -4,
  },
  wordmark: {
    marginTop: 8,
    fontSize: 18,
    fontFamily: FontFamily.nexusDisplay,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
