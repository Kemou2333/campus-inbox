type StoragePort=Pick<Storage,'getItem'|'length'|'key'>;
export const DEVICE_SCOPE='device';
export function accountLocalScope(account:string|null):string{return account?.trim()?`account:${account.trim().toLocaleLowerCase()}`:DEVICE_SCOPE;}
/** Use the last account only while its existing local session remains present. No token is copied into feature storage. */
export function initialAccountLocalScope(storage:StoragePort):string{
 const account=storage.getItem('campus-inbox:account-username:v1');if(!account)return DEVICE_SCOPE;
 try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith('campus-inbox:sync:v1:'))continue;const value=JSON.parse(storage.getItem(key)||'null');if(value?.version===1&&typeof value.key==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value.key))return accountLocalScope(account);}}catch{/* A malformed session never grants access to another account's local state. */}
 return DEVICE_SCOPE;
}
