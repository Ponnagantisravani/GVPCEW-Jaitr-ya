import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='postgresql://test:test@127.0.0.1/test';
process.env.JWT_SECRET='test-only-secret-with-at-least-32-characters';
const {verifiedDecision,evidenceDigest,verifierReady}=await import('../src/services/attendanceVerifier.js');
const {env}=await import('../src/config/env.js');
test('attendance requires identity, liveness, matching challenge, student and evidence',()=>{
 const expected={challengeId:'challenge',studentId:'student',evidenceDigest:evidenceDigest([{image:'one'}])};
 const result={...expected,identityVerified:true,livenessVerified:true,verifierVersion:'tested-v1'};
 assert.equal(verifiedDecision(result,expected),true);
 for(const key of ['identityVerified','livenessVerified','challengeId','studentId','evidenceDigest','verifierVersion']) {
  assert.equal(verifiedDecision({...result,[key]:null},expected),false,key);
 }
 assert.notEqual(evidenceDigest([{image:'two'}]),expected.evidenceDigest);
});
test('production verifier must use HTTPS and a service key',()=>{
 const saved={production:env.production,attendanceVerifierUrl:env.attendanceVerifierUrl,attendanceVerifierKey:env.attendanceVerifierKey};
 try{
  Object.assign(env,{production:true,attendanceVerifierUrl:'http://localhost:8000/verify',attendanceVerifierKey:'key'});
  assert.equal(verifierReady(),false);
  env.attendanceVerifierUrl='https://verifier.example/verify';assert.equal(verifierReady(),true);
  env.attendanceVerifierKey='';assert.equal(verifierReady(),false);
 }finally{Object.assign(env,saved);}
});
