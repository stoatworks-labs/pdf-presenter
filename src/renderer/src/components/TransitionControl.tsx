import {
  MAX_TRANSITION_MS,
  MIN_TRANSITION_MS,
  TRANSITION_DIRECTIONS,
  TRANSITION_DIRECTION_LABELS,
  TRANSITION_EFFECTS,
  TRANSITION_EFFECT_LABELS,
  clampTransitionMs,
  isDirectional,
  type TransitionSettings
} from '../../../shared/transitions'

interface Props {
  settings: TransitionSettings
  onChange: (settings: TransitionSettings) => void
}

/**
 * One transition for the whole deck. There is no per-slide control on purpose:
 * a PDF has nowhere to store per-slide transition data, and every presenter
 * who has asked for this wanted one look applied consistently.
 *
 * The direction picker only appears for the effects that read it, rather than
 * greying out — a disabled control invites the question "why doesn't this do
 * anything", which the absence doesn't.
 */
function TransitionControl({ settings, onChange }: Props): React.JSX.Element {
  return (
    <div className="transition-control">
      <label className="transition-label" htmlFor="transition-effect">
        Transition
      </label>
      <select
        id="transition-effect"
        className="transition-select"
        value={settings.effect}
        onChange={(e) =>
          onChange({ ...settings, effect: e.target.value as TransitionSettings['effect'] })
        }
      >
        {TRANSITION_EFFECTS.map((effect) => (
          <option key={effect} value={effect}>
            {TRANSITION_EFFECT_LABELS[effect]}
          </option>
        ))}
      </select>

      {isDirectional(settings.effect) && (
        <select
          className="transition-select"
          aria-label="Transition direction"
          value={settings.direction}
          onChange={(e) =>
            onChange({
              ...settings,
              direction: e.target.value as TransitionSettings['direction']
            })
          }
        >
          {TRANSITION_DIRECTIONS.map((direction) => (
            <option key={direction} value={direction}>
              {TRANSITION_DIRECTION_LABELS[direction]}
            </option>
          ))}
        </select>
      )}

      {settings.effect !== 'cut' && (
        <>
          <input
            type="number"
            className="transition-duration"
            aria-label="Transition duration in milliseconds"
            min={MIN_TRANSITION_MS}
            max={MAX_TRANSITION_MS}
            step={50}
            value={settings.durationMs}
            /* Clamped on blur, not on change: clamping mid-typing turns "50"
               into "500" the moment you delete a digit to type a new one. */
            onChange={(e) => onChange({ ...settings, durationMs: Number(e.target.value) })}
            onBlur={(e) =>
              onChange({ ...settings, durationMs: clampTransitionMs(Number(e.target.value)) })
            }
          />
          <span className="transition-unit">ms</span>
        </>
      )}
    </div>
  )
}

export default TransitionControl
