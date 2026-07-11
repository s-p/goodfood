import { ChevronLeft } from "../components/Icons";
import { isNativeApp } from "../lib/native";

export function GuideScreen({ onBack }: { onBack: () => void }) {
  return isNativeApp() ? <NativeGuide onBack={onBack} /> : <WebGuide onBack={onBack} />;
}

/* Shown inside the native iOS app, where everything just works. */
function NativeGuide({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <div className="back-row">
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft /> Back
        </button>
      </div>
      <h1 className="screen-title" style={{ paddingTop: 0 }}>
        iPhone setup
      </h1>
      <p className="screen-sub">
        You're in the native app — notifications and the Action Button work
        fully.
      </p>

      <div className="section-label">1 · Action Button → snap food</div>
      <div className="card card-pad">
        <div className="guide-step">
          <div className="guide-num">1</div>
          <p>
            Open the <b>Shortcuts</b> app → <b>+</b> → add the <b>“Open URLs”</b>{" "}
            action → enter <code>goodfood://snap</code>. Name it “Log food”.
            This jumps straight into the camera.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">2</div>
          <p>
            iPhone <b>Settings → Action Button</b> → choose <b>Shortcut</b> →
            pick <b>Log food</b>. Press-and-hold the Action Button: GoodFood
            opens with the camera ready.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">3</div>
          <p>
            Alternative without the camera jump: use the <b>“Open App”</b>{" "}
            action → <b>GoodFood</b> — and turn on{" "}
            <b>Settings → Open camera on launch</b> if you want camera-first
            there too.
          </p>
        </div>
      </div>

      <div className="section-label">2 · Check-in notifications</div>
      <div className="card card-pad">
        <div className="guide-step">
          <div className="guide-num">1</div>
          <p>
            After each logged meal, a reminder is <b>scheduled with iOS</b> —
            it arrives on time even when the app is closed.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">2</div>
          <p>
            <b>Press and hold</b> the notification: rating buttons appear
            (🪫 Drained … ⚡ Energized) and your check-in is saved{" "}
            <b>without opening the app</b>. A plain tap opens the full
            check-in with symptoms.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">3</div>
          <p>
            Allow notifications when the app asks (after your first save), or
            enable them later in iPhone <b>Settings → Notifications →
            GoodFood</b>. Try it via <b>Settings → Notifications → Test</b>.
          </p>
        </div>
      </div>
    </div>
  );
}

/* Shown in the browser / home-screen web app, with its iOS limitations. */
function WebGuide({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <div className="back-row">
        <button className="back-btn" onClick={onBack}>
          <ChevronLeft /> Back
        </button>
      </div>
      <h1 className="screen-title" style={{ paddingTop: 0 }}>
        iPhone setup
      </h1>
      <p className="screen-sub">Three minutes, then logging is one button press.</p>

      <div className="section-label">1 · Install the app</div>
      <div className="card card-pad">
        <div className="guide-step">
          <div className="guide-num">1</div>
          <p>
            Open this site in <b>Safari</b>, tap the <b>Share</b> button, then{" "}
            <b>Add to Home Screen</b>.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">2</div>
          <p>
            Always use the <b>home-screen app</b> from now on — the browser tab
            and the installed app keep <b>separate data</b> on iOS.
          </p>
        </div>
      </div>

      <div className="section-label">2 · Action Button → snap food</div>
      <div className="card card-pad">
        <div className="guide-step">
          <div className="guide-num">1</div>
          <p>
            In GoodFood, turn on <b>Settings → Open camera on launch</b>.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">2</div>
          <p>
            Open the <b>Shortcuts</b> app → <b>+</b> → add the <b>“Open App”</b>{" "}
            action → choose <b>GoodFood</b> (home-screen web apps appear in the
            app list on iOS 17+). Name the shortcut “Log food”.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">3</div>
          <p>
            iPhone <b>Settings → Action Button</b> → choose <b>Shortcut</b> →
            pick <b>Log food</b>. Press-and-hold the Action Button: GoodFood
            opens straight into the camera.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">4</div>
          <p>
            <b>GoodFood missing from the app list?</b> That's common with web
            apps. In order: open GoodFood once from the Home Screen · force-quit
            the Shortcuts app and reopen · in the picker, <b>scroll</b> to G
            instead of typing in search (search often skips web apps) · restart
            the iPhone.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">5</div>
          <p>
            <b>Still missing?</b> Your iOS only lists native apps there. Best
            alternative: put the GoodFood icon <b>in the Dock</b> — with “Open
            camera on launch” that's exactly one tap to the camera. (Avoid the
            “Open URLs” action: it opens Safari, and iOS keeps Safari's data
            separate from the installed app.)
          </p>
        </div>
      </div>

      <div className="section-label">3 · Check-in reminders</div>
      <div className="card card-pad">
        <div className="guide-step">
          <div className="guide-num">1</div>
          <p>
            <b>What works automatically:</b> while GoodFood is open, a
            notification fires when your check-in is due. When it's closed, the
            app <b>badge</b> shows due check-ins, and opening the app jumps
            straight to the check-in.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">2</div>
          <p>
            <b>iOS limitation, honestly:</b> a home-screen web app can't schedule
            a notification for later while it's closed (Apple only allows that
            via server push, and GoodFood keeps everything on-device). The{" "}
            <b>native GoodFood iOS app</b> doesn't have this limit — see the
            repo's README for building it.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">3</div>
          <p>
            <b>Optional guaranteed nudge:</b> in your “Log food” shortcut, add{" "}
            <b>before</b> the Open App action: <b>“Add New Reminder”</b> →
            “How do I feel after eating?” → <b>in 30 minutes</b>. Every
            action-button press then also schedules a reminder.
          </p>
        </div>
        <div className="guide-step">
          <div className="guide-num">4</div>
          <p>
            On <b>Android and desktop</b>, notifications include 1-tap energy
            buttons that save your check-in without even opening the app.
          </p>
        </div>
      </div>
    </div>
  );
}
