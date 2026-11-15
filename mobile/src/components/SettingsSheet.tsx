import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LANGUAGES, type Features, type Voice } from "../modes";
import { ENV_API_URL, normalizeUrl, RATES, type Settings } from "../settings";
import { colors, MIN_TARGET, radius, type } from "../theme";
import type { HatStatus } from "../useHatCamera";
import { BrandMark } from "./BrandMark";
import { Segmented } from "./Segmented";
import { Icon, PillButton } from "./ui";

export type Connection = { state: "checking" | "ok" | "down"; features: Features };

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={s.header}>
      <View style={{ minWidth: MIN_TARGET }} />
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Done"
        hitSlop={8}
        style={s.done}
      >
        <Text style={[type.headline, { fontWeight: "700" }]}>Done</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.body}>{label}</Text>
        {hint ? <Text style={type.footnote}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function describeFeatures(f: Features): string {
  const on: string[] = [];
  if (f.elevenlabs) on.push("natural voice");
  if (f.lookup) on.push("web lookup");
  if (f.transcribe) on.push("voice questions");
  if (f.elevenlabs === null && f.lookup === null) return "Connected.";
  return on.length ? `Connected, with ${on.join(", ")}.` : "Connected. Natural voice and web lookup are off on this server.";
}

export function SettingsSheet({
  visible,
  settings,
  connection,
  voices,
  speaking,
  historyOn,
  focusServer = false,
  onClearHistory,
  hatStatus,
  onConnectHat,
  onDisconnectHat,
  onPreviewVoice,
  onStopPreview,
  reduceMotion,
  onChange,
  onCheck,
  onClose,
}: {
  visible: boolean;
  settings: Settings;
  connection: Connection;
  voices: Voice[] | null;
  speaking: boolean;
  historyOn: boolean;
  focusServer?: boolean; // opened from "Can't reach the server": scroll to Server (the last group)
  onClearHistory: () => void;
  hatStatus: HatStatus | null; // null = not connected
  onConnectHat: (deviceId: string, pairCode: string) => void;
  onDisconnectHat: () => void;
  onPreviewVoice: (v: Voice | null) => void;
  onStopPreview: () => void;
  reduceMotion: boolean;
  onChange: (patch: Partial<Settings>) => void;
  onCheck: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState(settings.apiUrl);
  const [hatId, setHatId] = useState(settings.hatDeviceId);
  const [hatCode, setHatCode] = useState(settings.hatPairCode);
  useEffect(() => {
    setHatId(settings.hatDeviceId);
    setHatCode(settings.hatPairCode);
  }, [settings.hatDeviceId, settings.hatPairCode, visible]);
  const hatOn = hatStatus !== null;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (!visible || !focusServer) return;
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: !reduceMotion }), 350); // after the sheet slides in
    return () => clearTimeout(t);
  }, [visible, focusServer, reduceMotion]);
  useEffect(() => setUrl(settings.apiUrl), [settings.apiUrl, visible]);

  const commitUrl = () => {
    const next = normalizeUrl(url);
    onChange({ apiUrl: next === ENV_API_URL ? "" : next });
  };

  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType={reduceMotion ? "none" : "slide"} onRequestClose={onClose}>
      <View style={s.root}>
        <SheetHeader title="Settings" onClose={onClose} />
        <ScrollView ref={scroll} contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <Text style={type.largeTitle} accessibilityRole="header">
            Settings
          </Text>

          <View style={s.group}>
            <Text style={[type.caption, s.groupLabel]}>Camera</Text>
            <View style={s.card}>
              <Row label="Detect" hint="Shows a card when the camera sees something to read. Nothing is read until you tap it.">
                <Switch
                  value={settings.autoCapture}
                  onValueChange={(v) => onChange({ autoCapture: v, autoOffByServer: false })}
                  accessibilityLabel="Detect"
                  trackColor={{ true: colors.primary, false: colors.hairline }}
                  thumbColor={colors.bg}
                  ios_backgroundColor={colors.hairline}
                />
              </Row>
            </View>
          </View>

          <View style={s.group}>
            <Text style={[type.caption, s.groupLabel]}>Hat camera</Text>
            <View style={[s.card, { padding: 16, gap: 12 }]}>
              <TextInput
                value={hatId}
                onChangeText={setHatId}
                onEndEditing={() => onChange({ hatDeviceId: hatId.trim() })}
                placeholder="Device ID"
                placeholderTextColor={colors.secondary}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!hatOn}
                style={[type.body, s.field]}
                accessibilityLabel="Hat camera device ID"
              />
              <TextInput
                value={hatCode}
                onChangeText={setHatCode}
                onEndEditing={() => onChange({ hatPairCode: hatCode.trim() })}
                placeholder="Pair code"
                placeholderTextColor={colors.secondary}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!hatOn}
                style={[type.body, s.field]}
                accessibilityLabel="Hat camera pair code"
              />
              {hatOn ? (
                <>
                  <View style={s.status} accessibilityLiveRegion="polite">
                    <Icon
                      sf={hatStatus === "live" ? "checkmark.circle.fill" : "exclamationmark.circle"}
                      ion={hatStatus === "live" ? "checkmark-circle" : "alert-circle-outline"}
                      size={20}
                    />
                    <Text style={[type.subhead, { flex: 1, color: colors.label }]}>
                      {hatStatus === "live"
                        ? "Connected. The phone speaks what the hat sees."
                        : hatStatus === "missing"
                          ? "This server doesn't support the hat camera yet."
                          : hatStatus === "unauthorized"
                            ? "The pair code was rejected."
                            : hatStatus === "elsewhere"
                              ? "Your hat is connected to another phone."
                              : hatStatus === "invalid"
                              ? "That device ID isn't valid (letters, numbers and dashes)."
                              : hatStatus === "offline"
                              ? "Can't reach the server."
                              : "Connecting…"}
                    </Text>
                  </View>
                  <PillButton label="Disconnect" variant="secondary" onPress={onDisconnectHat} />
                </>
              ) : (
                <PillButton
                  label="Connect"
                  disabled={!hatId.trim()}
                  onPress={() => onConnectHat(hatId.trim(), hatCode.trim())}
                  accessibilityHint="Turns off the phone camera and speaks what the hat camera sees"
                />
              )}
            </View>
            <Text style={[type.footnote, s.groupLabel]}>
              A camera on a cap sends photos to the server; this phone reads the answers aloud. Keep SightLine open.
            </Text>
          </View>

          <View style={s.group}>
            <Text style={[type.caption, s.groupLabel]}>Speech</Text>
            <View style={s.card}>
              <Row label="Auto-speak" hint="Read answers aloud as soon as they arrive.">
                <Switch
                  value={settings.autoSpeak}
                  onValueChange={(v) => onChange({ autoSpeak: v })}
                  accessibilityLabel="Auto-speak"
                  trackColor={{ true: colors.primary, false: colors.hairline }}
                  thumbColor={colors.bg}
                  ios_backgroundColor={colors.hairline}
                />
              </Row>
              <View style={s.rule} />
              <Row
                label="Natural voice"
                hint={connection.features.elevenlabs === false ? "Not set up on this server. Using the iPhone voice." : "ElevenLabs voice. Off uses the iPhone voice."}
              >
                <Switch
                  value={settings.naturalVoice}
                  onValueChange={(v) => onChange({ naturalVoice: v })}
                  accessibilityLabel="Natural voice"
                  trackColor={{ true: colors.primary, false: colors.hairline }}
                  thumbColor={colors.bg}
                  ios_backgroundColor={colors.hairline}
                />
              </Row>
              <View style={s.rule} />
              <View style={[s.row, { flexDirection: "column", alignItems: "stretch", gap: 10 }]}>
                <Text style={type.body}>Speed</Text>
                <Segmented
                  label="Speed"
                  options={RATES}
                  value={settings.rate}
                  onChange={(v) => onChange({ rate: v })}
                  format={(v) => `${v}×`}
                  describe={(v) => `${v} times`}
                />
              </View>
            </View>
          </View>

          {voices && settings.naturalVoice && connection.features.elevenlabs !== false ? (
            <View style={s.group}>
              <Text style={[type.caption, s.groupLabel]}>Voice</Text>
              <View style={s.card}>
                {[null, ...voices].map((v, i) => {
                  const id = v?.id ?? "";
                  const on = settings.voiceId === id;
                  const name = v?.name ?? "Default voice";
                  return (
                    <View key={id || "default"}>
                      {i > 0 ? <View style={s.rule} /> : null}
                      <Pressable
                        onPress={() => {
                          onChange({ voiceId: id });
                          onPreviewVoice(v);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={v?.description ? `${name}, ${v.description}` : name}
                        accessibilityHint="Selects this voice and plays a sample"
                        accessibilityState={{ selected: on }}
                        style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfacePressed }]}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[type.body, { fontWeight: on ? "600" : "400" }]}>{name}</Text>
                          {v?.description ? (
                            <Text style={type.footnote} numberOfLines={2}>
                              {v.description}
                            </Text>
                          ) : !v ? (
                            <Text style={type.footnote}>The server's standard voice.</Text>
                          ) : null}
                        </View>
                        {on ? <Icon sf="checkmark" ion="checkmark" size={18} weight="bold" /> : null}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
              <View style={[s.groupLabel, { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }]}>
                <Text style={[type.footnote, { flex: 1 }]}>Tap a voice to choose it and hear a sample.</Text>
                {speaking ? (
                  <PillButton label="Stop sample" variant="secondary" onPress={onStopPreview} />
                ) : null}
              </View>
            </View>
          ) : null}

          {historyOn ? (
            <View style={s.group}>
              <Text style={[type.caption, s.groupLabel]}>History</Text>
              <View style={s.card}>
                <Pressable
                  onPress={onClearHistory}
                  accessibilityRole="button"
                  accessibilityLabel="Clear history"
                  accessibilityHint="Removes your recent scans from the server"
                  style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfacePressed }]}
                >
                  <Icon sf="trash" ion="trash-outline" size={18} color={colors.record} />
                  <Text style={[type.body, { flex: 1, color: colors.record, fontWeight: "600" }]}>Clear history</Text>
                </Pressable>
              </View>
              <Text style={[type.footnote, s.groupLabel]}>Recent scans are kept on the server for this phone only.</Text>
            </View>
          ) : null}

          <View style={s.group}>
            <Text style={[type.caption, s.groupLabel]}>Server</Text>
            <View style={[s.card, { padding: 16, gap: 12 }]}>
              <TextInput
                value={url}
                onChangeText={setUrl}
                onEndEditing={commitUrl}
                onSubmitEditing={commitUrl}
                placeholder={ENV_API_URL || "https://your-app.vercel.app"}
                placeholderTextColor={colors.secondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                style={[type.body, s.field]}
                accessibilityLabel="Server address"
                accessibilityHint={`Leave empty to use ${ENV_API_URL || "the address in the app's .env file"}`}
              />
              <View style={s.status} accessibilityLiveRegion="polite">
                {connection.state === "checking" ? (
                  <ActivityIndicator color={colors.label} />
                ) : (
                  <Icon
                    sf={connection.state === "ok" ? "checkmark.circle.fill" : "xmark.octagon"}
                    ion={connection.state === "ok" ? "checkmark-circle" : "close-circle-outline"}
                    size={20}
                  />
                )}
                <Text style={[type.subhead, { flex: 1, color: colors.label }]}>
                  {connection.state === "checking"
                    ? "Checking…"
                    : connection.state === "ok"
                      ? describeFeatures(connection.features)
                      : "Can't reach this server."}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <PillButton label="Check connection" onPress={() => { commitUrl(); onCheck(); }} style={{ flexGrow: 1 }} />
                {settings.apiUrl ? (
                  <PillButton label="Use default" variant="secondary" onPress={() => onChange({ apiUrl: "" })} style={{ flexGrow: 1 }} />
                ) : null}
              </View>
            </View>
            <Text style={[type.footnote, s.groupLabel]}>
              Default: {ENV_API_URL || "not set"}. Photos go to this server to be described.
            </Text>
          </View>
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 16 }}>
            <BrandMark size={44} />
            <Text style={type.headline}>SightLine</Text>
            <Text style={type.footnote}>Point your camera. Hear the world.</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export function LanguageSheet({
  visible,
  language,
  reduceMotion,
  onPick,
  onClose,
}: {
  visible: boolean;
  language: string;
  reduceMotion: boolean;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType={reduceMotion ? "none" : "slide"} onRequestClose={onClose}>
      <View style={s.root}>
        <SheetHeader title="Translate to" onClose={onClose} />
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}>
          <Text style={type.largeTitle} accessibilityRole="header">
            Translate to
          </Text>
          <View style={s.card}>
            {LANGUAGES.map((l, i) => {
              const on = l.name === language;
              return (
                <View key={l.code}>
                  {i > 0 ? <View style={s.rule} /> : null}
                  <Pressable
                    onPress={() => onPick(l.name)}
                    accessibilityRole="button"
                    accessibilityLabel={l.name}
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfacePressed }]}
                  >
                    <Text style={[type.body, { flex: 1, fontWeight: on ? "600" : "400" }]}>{l.name}</Text>
                    {on ? <Icon sf="checkmark" ion="checkmark" size={18} weight="bold" /> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, paddingTop: 10, minHeight: 56 },
  done: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, gap: 24 },
  group: { gap: 8 },
  groupLabel: { paddingHorizontal: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: 16 },
  field: { minHeight: 50, backgroundColor: colors.bg, borderRadius: radius.field, paddingHorizontal: 14, paddingVertical: 12 },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
});
