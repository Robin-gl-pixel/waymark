import { statusBadgeIcon, statusBadgeLabel } from '../statusBadge';

// #42 — friend-facing badge rendering rules. Kept as a pure mapping so the
// scan-ability contract from the acceptance criteria stays lockable:
//   status='wishlist' -> '♡'
//   status='visited'  -> '✓'
//   status=null       -> nothing (no badge, no placeholder)
describe('statusBadgeIcon', () => {
  it('maps wishlist to the heart glyph', () => {
    expect(statusBadgeIcon('wishlist')).toBe('♡');
  });

  it('maps visited to the check glyph', () => {
    expect(statusBadgeIcon('visited')).toBe('✓');
  });

  it('renders nothing for null status', () => {
    expect(statusBadgeIcon(null)).toBeNull();
  });

  it('renders nothing for pre-#41 pins where the field is absent (undefined)', () => {
    // Firestore docs written before #41 shipped have no `status` field. When
    // hydrated at the seam they surface as `undefined`; the badge must be
    // omitted rather than showing a placeholder.
    expect(statusBadgeIcon(undefined)).toBeNull();
  });
});

describe('statusBadgeLabel', () => {
  it('describes wishlist for accessibility readers', () => {
    expect(statusBadgeLabel('wishlist')).toBe('Envie');
  });

  it('describes visited for accessibility readers', () => {
    expect(statusBadgeLabel('visited')).toBe('Déjà allé');
  });

  it('returns null when there is no badge to describe', () => {
    expect(statusBadgeLabel(null)).toBeNull();
    expect(statusBadgeLabel(undefined)).toBeNull();
  });
});
