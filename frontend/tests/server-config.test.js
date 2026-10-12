import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeServerUrl} from '../src/server-config.js';
test('campus server addresses default to the API root and preserve explicit paths',()=>{
 assert.equal(normalizeServerUrl(' http://192.168.89.124:4000/ '),'http://192.168.89.124:4000/api');
 assert.equal(normalizeServerUrl('https://campus.example.edu/api/'),'https://campus.example.edu/api');
 for(const value of ['','/api','javascript:alert(1)','https://user:password@campus.example.edu','https://campus.example.edu?x=1','https://campus.example.edu#x']) assert.throws(()=>normalizeServerUrl(value));
});
