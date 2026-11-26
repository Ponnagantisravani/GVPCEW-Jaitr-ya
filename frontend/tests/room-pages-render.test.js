import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

test('Rooms and Labs renders its setup panels when opened',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});
 try{const {RoomsLabs}=await server.ssrLoadModule('/src/RoomsLabs.jsx');const html=renderToStaticMarkup(React.createElement(RoomsLabs));assert.match(html,/Rooms and Labs/);assert.match(html,/Loading room setup/);}
 finally{await server.close();}
});

test('Room Allotment renders its weekly controls when opened',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});
 try{const {RoomAllotment}=await server.ssrLoadModule('/src/RoomAllotment.jsx');const html=renderToStaticMarkup(React.createElement(RoomAllotment));assert.match(html,/Room Allotment/);assert.match(html,/Generate room allotment/);}
 finally{await server.close();}
});
