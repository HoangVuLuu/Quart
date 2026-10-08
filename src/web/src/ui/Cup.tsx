import { cx } from './cx';

export type CupFlavour = 'opening' | 'closing' | 'milk-tea';
export type CupMood = 'happy' | 'sleepy' | 'wow';

type CupProps = {
  // The colour of the drink: lime for an opening, lavender for a closing, milk-tea brown when a
  // publish is blocked.
  flavour?: CupFlavour;
  // happy: open eyes and a smile. sleepy: closed arcs, for closing shifts. wow: an open mouth, for
  // something that needs attention, such as a shift with one person.
  mood?: CupMood;
  // Give it a width (w-16); the height follows.
  className?: string;
};

// The bubble tea cup, the one illustration in the product (spec 19.8). It is drawn in CSS (see
// .quart-cup in the stylesheet), so it scales and takes its colours from the tokens.
//
// It is decoration and is hidden from screen readers: whatever the cup implies must also be written
// in words next to it (NFR-008). It does not animate (19.5).
export function Cup({ flavour = 'opening', mood = 'happy', className }: CupProps) {
  return (
    <div aria-hidden="true" data-flavour={flavour} data-mood={mood} className={cx('quart-cup', className)}>
      <span className="quart-cup-part quart-cup-straw" />
      <span className="quart-cup-part quart-cup-rim" />
      <span className="quart-cup-part quart-cup-body">
        <span className="quart-cup-shine" />
        {mood === 'sleepy' ? (
          <>
            <span className="quart-cup-part quart-cup-lid quart-cup-left" />
            <span className="quart-cup-part quart-cup-lid quart-cup-right" />
          </>
        ) : (
          <>
            <span className="quart-cup-part quart-cup-eye quart-cup-left" />
            <span className="quart-cup-part quart-cup-eye quart-cup-right" />
          </>
        )}
        <span className="quart-cup-part quart-cup-cheek quart-cup-left" />
        <span className="quart-cup-part quart-cup-cheek quart-cup-right" />
        {mood === 'wow' ? (
          <span className="quart-cup-part quart-cup-gasp" />
        ) : (
          <span className="quart-cup-part quart-cup-smile" />
        )}
        <span className="quart-cup-part quart-cup-pearls quart-cup-pearls-high">
          <i />
          <i />
        </span>
        <span className="quart-cup-part quart-cup-pearls quart-cup-pearls-low">
          <i />
          <i />
          <i />
        </span>
      </span>
    </div>
  );
}
