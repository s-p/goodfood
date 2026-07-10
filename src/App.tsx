import { useEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "./store";
import { LogScreen } from "./screens/LogScreen";
import { EntryDetailScreen } from "./screens/EntryDetailScreen";
import { CheckinScreen } from "./screens/CheckinScreen";
import { InsightsScreen } from "./screens/InsightsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { GuideScreen } from "./screens/GuideScreen";
import { CaptureSheet } from "./components/CaptureSheet";
import { CameraIcon, ChartIcon, GearIcon, ListIcon } from "./components/Icons";
import { loadSettings } from "./lib/settings";

type Route =
  | { name: "log" }
  | { name: "entry"; id: string }
  | { name: "checkin"; entryId?: string }
  | { name: "insights" }
  | { name: "settings" }
  | { name: "guide" };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, "");
  const [head, arg] = h.split("/");
  switch (head) {
    case "entry":
      return arg ? { name: "entry", id: arg } : { name: "log" };
    case "checkin":
      return { name: "checkin", entryId: arg || undefined };
    case "insights":
      return { name: "insights" };
    case "settings":
      return { name: "settings" };
    case "guide":
      return { name: "guide" };
    default:
      return { name: "log" };
  }
}

function navigate(path: string) {
  location.hash = path;
}

/** Was the app launched with ?a=snap (action-button flow)? */
function launchWantsSnap(): boolean {
  return new URLSearchParams(location.search).get("a") === "snap";
}

function Shell() {
  const { ready, due } = useStore();
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [capture, setCapture] = useState<{ open: boolean; auto: boolean }>(() => {
    // ?a=snap (action button) always opens the camera. The snap-on-launch
    // setting only applies to a plain launch — never on top of a
    // notification-driven #/checkin or #/entry deep link.
    const snap =
      launchWantsSnap() ||
      (loadSettings().snapOnLaunch && parseHash().name === "log");
    return { open: snap, auto: snap };
  });
  const jumpedToDue = useRef(false);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // On launch (once), jump straight to the check-in screen when one is due —
  // this is the promise the iPhone guide makes for closed-app reminders.
  useEffect(() => {
    if (!ready || jumpedToDue.current) return;
    jumpedToDue.current = true;
    if (due.length > 0 && parseHash().name === "log" && !capture.open) {
      navigate("/checkin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;

  const tab =
    route.name === "insights"
      ? "insights"
      : route.name === "settings" || route.name === "guide"
        ? "settings"
        : "log";

  return (
    <div className="app">
      {route.name === "log" && (
        <LogScreen
          onOpenEntry={(id) => navigate(`/entry/${id}`)}
          onCheckin={() => navigate("/checkin")}
        />
      )}
      {route.name === "entry" && (
        <EntryDetailScreen
          id={route.id}
          onBack={() => history.length > 1 ? history.back() : navigate("/")}
          onCheckin={() => navigate(`/checkin/${route.id}`)}
        />
      )}
      {route.name === "checkin" && (
        <CheckinScreen
          focusEntryId={route.entryId}
          onDone={() => navigate("/")}
        />
      )}
      {route.name === "insights" && <InsightsScreen />}
      {route.name === "settings" && (
        <SettingsScreen onOpenGuide={() => navigate("/guide")} />
      )}
      {route.name === "guide" && <GuideScreen onBack={() => navigate("/settings")} />}

      <nav className="tabbar">
        <div className="tabbar-inner">
          <button
            className={`tab${tab === "log" ? " active" : ""}`}
            onClick={() => navigate("/")}
          >
            <ListIcon />
            Log
          </button>
          <button
            className={`tab${route.name === "checkin" ? " active" : ""}`}
            onClick={() => navigate("/checkin")}
            style={{ position: "relative" }}
          >
            <PulseBadge count={due.length} />
            Feel
          </button>
          <button
            className="fab"
            aria-label="Log food with camera"
            onClick={() => setCapture({ open: true, auto: false })}
          >
            <CameraIcon size={26} />
          </button>
          <button
            className={`tab${tab === "insights" ? " active" : ""}`}
            onClick={() => navigate("/insights")}
          >
            <ChartIcon />
            Insights
          </button>
          <button
            className={`tab${tab === "settings" ? " active" : ""}`}
            onClick={() => navigate("/settings")}
          >
            <GearIcon />
            Settings
          </button>
        </div>
      </nav>

      {capture.open && (
        <CaptureSheet
          autoCamera={capture.auto}
          onClose={() => setCapture({ open: false, auto: false })}
        />
      )}
    </div>
  );
}

function PulseBadge({ count }: { count: number }) {
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <PulseIconWrap />
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: -3,
            right: -7,
            background: "var(--danger)",
            color: "#fff",
            borderRadius: 999,
            fontSize: 9.5,
            fontWeight: 700,
            minWidth: 15,
            height: 15,
            display: "grid",
            placeItems: "center",
            padding: "0 3px",
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
}

function PulseIconWrap() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12h4l2.2-5.5L13.5 17l2.3-5H21" />
    </svg>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
