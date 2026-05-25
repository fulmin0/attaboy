// Attaboy — Tweaks panel
// Bridges the host protocol + UI to the Knobs object in game.js.

(function () {
  const { useEffect } = React;

  function App() {
    // Mirror current global Knobs so changes here both update the runtime
    // and persist via __edit_mode_set_keys.
    const [t, setTweak] = useTweaks(window.Knobs);

    // Push updates into the running game whenever t changes
    useEffect(() => {
      Object.assign(window.Knobs, t);
      window.dispatchEvent(new CustomEvent('attaboy:tweak', { detail: t }));
    }, [t]);

    return (
      <TweaksPanel title="Tweaks">
        <TweakSection label="Look" />
        <TweakSelect
          label="Render style"
          value={t.renderStyle}
          options={['neon', 'wireframe', 'pixel', 'blueprint']}
          onChange={(v) => setTweak('renderStyle', v)}
        />
        <TweakSelect
          label="Color theme"
          value={t.theme}
          options={['cyan', 'amber', 'mint', 'violet', 'synthwave', 'mono']}
          onChange={(v) => setTweak('theme', v)}
        />
        <TweakSlider
          label="Starfield density"
          value={t.starfieldDensity}
          min={0} max={3} step={0.1}
          onChange={(v) => setTweak('starfieldDensity', v)}
        />
        <TweakSlider
          label="Screen shake"
          value={t.shakeIntensity}
          min={0} max={2} step={0.1}
          onChange={(v) => setTweak('shakeIntensity', v)}
        />

        <TweakSection label="Difficulty" />
        <TweakSlider
          label="Enemy speed"
          value={t.enemySpeed}
          min={0.4} max={2.5} step={0.1}
          onChange={(v) => setTweak('enemySpeed', v)}
        />
        <TweakSlider
          label="Bullet speed"
          value={t.bulletSpeed}
          min={0.5} max={2.5} step={0.1}
          onChange={(v) => setTweak('bulletSpeed', v)}
        />
        <TweakToggle
          label="God mode"
          value={t.godMode}
          onChange={(v) => setTweak('godMode', v)}
        />

        <TweakSection label="Audio" />
        <TweakToggle
          label="Mute"
          value={t.muted}
          onChange={(v) => setTweak('muted', v)}
        />

        <TweakSection label="Debug" />
        <TweakToggle
          label="Show FPS"
          value={t.showFps}
          onChange={(v) => setTweak('showFps', v)}
        />
        <TweakButton
          label="Reset hi-score"
          onClick={() => {
            localStorage.removeItem('attaboy:hi');
            const el = document.getElementById('ui-hiscore-title');
            if (el) el.textContent = '0';
          }}
        />
      </TweaksPanel>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById('tweaks-root'));
  root.render(<App />);
})();
