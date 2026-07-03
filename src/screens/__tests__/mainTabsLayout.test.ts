import { MAIN_TABS, CENTRAL_ACTION_INDEX } from '../mainTabsLayout';

/**
 * Post-v8 slice D pinned the tab-bar layout: [Carte · Liste · [+] · Réseau · Toi].
 * The founder tested v8 on device and this is the arrangement they signed off
 * on — any silent shuffle (e.g. moving [+] off-center, or bringing Settings
 * back as a tab) should trip a red test, not slip into a release.
 */
describe('MAIN_TABS layout (post-v8 slice D)', () => {
  it('has exactly five slots', () => {
    expect(MAIN_TABS).toHaveLength(5);
  });

  it('orders slots as [Carte · Liste · [+] · Réseau · Toi]', () => {
    expect(MAIN_TABS.map((t) => t.name)).toEqual([
      'Map',
      'List',
      '_Add',
      'Network',
      'Profile',
    ]);
  });

  it('places the central "+" action at the geometric middle of the row', () => {
    // A five-slot row means index 2 is the visual center. If MAIN_TABS grows
    // or shrinks, CENTRAL_ACTION_INDEX must move with it — this guards both.
    expect(MAIN_TABS[CENTRAL_ACTION_INDEX].kind).toBe('action');
    expect(MAIN_TABS[CENTRAL_ACTION_INDEX].name).toBe('_Add');
    expect(CENTRAL_ACTION_INDEX).toBe(Math.floor(MAIN_TABS.length / 2));
  });

  it('uses the French label "Toi" for the profile tab (post-slice-D rename)', () => {
    const profile = MAIN_TABS.find((t) => t.name === 'Profile');
    expect(profile?.label).toBe('Toi');
  });

  it('does not expose a Settings tab (merged into the Profile screen)', () => {
    // Settings became a stack push from the gear icon at the top-right of
    // MyProfileScreen. Any regression that re-adds it as a tab breaks the
    // "Toi" tab's role as the sole account entry point.
    expect(MAIN_TABS.some((t) => (t.name as string) === 'Settings')).toBe(false);
  });

  it('renders the "+" slot with a null label so no text sits under the disc', () => {
    // The prominent + button is purely iconographic; a text label under the
    // floating disc would look glued-on next to the mono labels of its peers.
    expect(MAIN_TABS[CENTRAL_ACTION_INDEX].label).toBeNull();
  });

  it('leaves every screen-kind tab with a French label', () => {
    // The label copy is what the user sees — leave one blank and the tab
    // reads as an unfinished shell. Test at the whole-row level so we can't
    // ship a partial French pass.
    for (const tab of MAIN_TABS) {
      if (tab.kind === 'screen') expect(typeof tab.label).toBe('string');
    }
  });
});
