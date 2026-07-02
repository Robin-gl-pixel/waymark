import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { extract } from './extract';
export { exchangeAppleCode } from './exchangeAppleCode';
export { deleteAccount } from './deleteAccount';
export { onReportCreated } from './reportTrigger';
