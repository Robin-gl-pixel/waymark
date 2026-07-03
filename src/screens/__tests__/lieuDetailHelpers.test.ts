import { buildShareMessage } from '../lieuDetailHelpers';
import { InMemoryLieuxService } from '../../services/inMemoryLieuxService';
import type { LieuInput } from '../../types/Lieu';

describe('buildShareMessage', () => {
  it('renders "name — address, city" when both are present', () => {
    expect(
      buildShareMessage({
        name: 'Chez Alice',
        address: '1 rue du Test',
        city: 'Paris',
      }),
    ).toBe('Chez Alice — 1 rue du Test, Paris');
  });

  it('drops the address when it is missing without an orphan comma', () => {
    expect(
      buildShareMessage({ name: 'Chez Alice', address: '', city: 'Paris' }),
    ).toBe('Chez Alice — Paris');
  });

  it('drops the city when it is missing without a trailing comma', () => {
    expect(
      buildShareMessage({
        name: 'Chez Alice',
        address: '1 rue du Test',
        city: '',
      }),
    ).toBe('Chez Alice — 1 rue du Test');
  });

  it('renders name only when neither address nor city are set', () => {
    expect(
      buildShareMessage({ name: 'Chez Alice', address: '', city: '' }),
    ).toBe('Chez Alice');
  });

  it('deduplicates when the city is already the address (Google returns city-only addresses)', () => {
    // Some Google Places lookups return an address that already IS the city
    // (typical for suburbs). Rendering « Paris, Paris » reads as a bug.
    expect(
      buildShareMessage({ name: 'Chez Alice', address: 'Paris', city: 'Paris' }),
    ).toBe('Chez Alice — Paris');
  });
});

/**
 * Add-photo integration at the seam — the founder reported the "+ Ajouter"
 * tile "does not work when tapped" (v8 device test). The screen's callback
 * ultimately calls `LieuxService.addPhoto`, so we pin the seam contract here:
 * the callback wiring appends a `source: 'user'` entry to the pin's gallery
 * and returns the new photo. Screen render is not exercised — see the
 * comment on UserProfileScreen.test.ts for the reasoning.
 */
describe('LieuDetail add-photo wire-up (seam contract)', () => {
  const USER = 'user-1';

  function makeInput(): LieuInput {
    return {
      name: 'Chez Alice',
      city: 'Paris',
      country: 'France',
      address: '1 rue du Test',
      lat: 48.85,
      lng: 2.35,
      category: 'resto',
      description: null,
      sourceAuthor: '@alice',
      userNotes: null,
      screenshotUri: 'file:///tmp/mock.png',
      screenshotMediaType: 'image/png',
    };
  }

  it('appends a user-source photo when the callback fires', async () => {
    const svc = new InMemoryLieuxService();
    const created = await svc.createLieu(USER, makeInput());

    // This is what LieuDetailScreen.launchPickerAndAdd calls after the picker
    // resolves — the intermediate ImagePicker + Manipulator layer is I/O only
    // (permissions + native module), so we exercise the deterministic seam.
    const added = await svc.addPhoto(USER, created.id, 'file:///tmp/new.jpg', 'user');

    expect(added.source).toBe('user');
    const after = await svc.getLieuById(USER, created.id);
    expect(after!.photos).toHaveLength(2);
    expect(after!.photos[1].storagePath).toBe(added.storagePath);
  });

  it('persists userNotes when the save-note callback fires', async () => {
    // Mirrors the collapse/expand notes editor: on tap "Enregistrer" the
    // screen invokes updateLieu({ userNotes }). Empty string is normalized to
    // null so a cleared note doesn't leave a whitespace value in Firestore.
    const svc = new InMemoryLieuxService();
    const created = await svc.createLieu(USER, makeInput());

    await svc.updateLieu(USER, created.id, {
      userNotes: 'À réserver 2 semaines avant',
    });
    let after = await svc.getLieuById(USER, created.id);
    expect(after!.userNotes).toBe('À réserver 2 semaines avant');

    await svc.updateLieu(USER, created.id, { userNotes: null });
    after = await svc.getLieuById(USER, created.id);
    expect(after!.userNotes).toBeNull();
  });
});
