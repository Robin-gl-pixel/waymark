import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { extract } from './extract';
export { extractFromShortcut } from './extractFromShortcut';
export { exchangeAppleCode } from './exchangeAppleCode';
export { deleteAccount } from './deleteAccount';
