import { load } from '../shared/storage.js';

chrome.runtime.onInstalled.addListener(() => load()); // khởi tạo schema
// V1.x: onMessageExternal (giao thức "fynn-tabzen") sẽ thêm ở đây.
