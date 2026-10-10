import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('timetable management renders its selectors and schedule on opening', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { TimetableManagement } = await server.ssrLoadModule('/src/TimetableManagement.jsx');
    const html = renderToStaticMarkup(React.createElement(TimetableManagement, { role: 'academic_coordinator' }));
    assert.match(html, /Select Year/);
    assert.match(html, /Select Section/);
    assert.match(html, /Class Teacher/);
    assert.match(html, /Faculty &amp; Subject Directory/);
  } finally {
    await server.close();
  }
});
