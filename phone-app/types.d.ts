declare module 'react-native' {
  import { ComponentType, ReactNode, Component } from 'react';

  export type StyleProp<T> = T;
  export interface ViewStyle { [key: string]: any }
  export interface TextStyle { [key: string]: any }
  export interface ImageStyle { [key: string]: any }

  export interface ViewProps { style?: any; children?: ReactNode; [key: string]: any }
  export const View: ComponentType<ViewProps>;

  export interface TextProps { style?: any; children?: ReactNode; [key: string]: any }
  export const Text: ComponentType<TextProps>;

  export interface ScrollViewProps { style?: any; children?: ReactNode; [key: string]: any }
  export const ScrollView: ComponentType<ScrollViewProps>;

  export interface TextInputProps { style?: any; [key: string]: any }
  export const TextInput: ComponentType<TextInputProps>;

  export interface TouchableOpacityProps { style?: any; [key: string]: any }
  export const TouchableOpacity: ComponentType<TouchableOpacityProps>;

  export interface SwitchProps { [key: string]: any }
  export const Switch: ComponentType<SwitchProps>;

  export interface RefreshControlProps { [key: string]: any }
  export const RefreshControl: ComponentType<RefreshControlProps>;

  export interface FlatListProps<T> { data?: T[]; keyExtractor?: (item: T, index: number) => string; renderItem?: (info: { item: T; index: number }) => ReactNode; [key: string]: any }
  export class FlatList<T = any> extends Component<FlatListProps<T>> {}

  export class ActivityIndicator extends Component<{ [key: string]: any }> {}

  export const Platform: { OS: string; select: <T>(spec: { ios?: T; android?: T; default?: T }) => T };
  export const StyleSheet: { create: <T extends Record<string, any>>(styles: T) => T; hairlineWidth: () => number; absoluteFill: any };
  export const Alert: { alert: (title: string, message?: string, buttons?: any[]) => void };
  export const Dimensions: { get: (d: string) => { width: number; height: number } };
}

declare module 'expo-router' {
  import { ComponentType } from 'react';

  export function useFocusEffect(callback: () => void | (() => void), deps?: any[]): void;

  export const Tabs: ComponentType<any> & {
    Screen: ComponentType<any>;
    Navigator: ComponentType<any>;
  };
  export function Stack(options?: any): any;
  export const Link: ComponentType<any>;
  export const router: { push: (path: string) => void; replace: (path: string) => void };
  export const useLocalSearchParams: () => Record<string, string>;
}

declare module 'expo-task-manager' {
  export function defineTask(name: string, task: (data: any) => Promise<number>): void;
  export function isTaskRegisteredAsync(name: string): Promise<boolean>;
  export function registerTaskAsync(name: string, options?: any): Promise<void>;
  export function unregisterTaskAsync(name: string): Promise<void>;
  export function executeTask(name: string, data: any): Promise<void>;
}

declare module 'expo-background-fetch' {
  export const BackgroundFetchResult: {
    NoData: 1;
    NewData: 2;
    Failed: 3;
  };
  export const BackgroundFetchStatus: {
    Denied: number;
    Restricted: number;
    Available: number;
  };
  export function getStatusAsync(): Promise<number>;
  export function registerTaskAsync(taskName: string, options: {
    minimumInterval?: number;
    stopOnTerminate?: boolean;
    startOnBoot?: boolean;
  }): Promise<void>;
  export function unregisterTaskAsync(taskName: string): Promise<void>;
}

declare module 'expo-notifications' {
  export function setNotificationHandler(handler: {
    handleNotification: (notification: any) => Promise<{
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    }>;
  }): void;

  export function requestPermissionsAsync(): Promise<{ status: string }>;
  export function getPermissionsAsync(): Promise<{ status: string }>;

  export function setNotificationChannelAsync(
    channelId: string,
    channel: {
      name: string;
      importance: number;
      vibrationPattern?: number[];
    }
  ): Promise<void>;

  export const AndroidImportance: {
    HIGH: number;
    DEFAULT: number;
    LOW: number;
    NONE: number;
  };

  export function scheduleNotificationAsync(options: {
    content: {
      title: string;
      body: string;
      data?: any;
    };
    trigger: any;
  }): Promise<string>;
}

declare module 'expo-modules-core' {
  export function requireNativeModule<T>(name: string): T;
}

declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    clear(): Promise<void>;
  };
  export default AsyncStorage;
}

declare module '@expo/vector-icons' {
  import { ComponentType } from 'react';

  export const Ionicons: ComponentType<{
    name: string;
    size?: number;
    color?: string;
  }> & { glyphMap: Record<string, number> };
}

declare var process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
  };
};
