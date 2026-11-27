import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSafeFormattedBlocks,
  plainEditorTextToHtml,
} from './uiCopyUtils';

test('parseSafeFormattedBlocks renders safe headings, lists, and inline formatting cleanly', () => {
  const html = plainEditorTextToHtml(
    '### Payout Policy\n\nAll **cashouts** require *KYC* verification.\n\n- Fast 15-min review\n- Zero hidden fees',
  );
  const blocks = parseSafeFormattedBlocks(html);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], {
    type: 'heading',
    inlines: [{ type: 'text', text: 'Payout Policy' }],
  });
  assert.deepEqual(blocks[1], {
    type: 'paragraph',
    inlines: [
      { type: 'text', text: 'All ' },
      { type: 'strong', text: 'cashouts' },
      { type: 'text', text: ' require ' },
      { type: 'em', text: 'KYC' },
      { type: 'text', text: ' verification.' },
    ],
  });
  assert.deepEqual(blocks[2], {
    type: 'list',
    ordered: false,
    items: [
      [{ type: 'text', text: 'Fast 15-min review' }],
      [{ type: 'text', text: 'Zero hidden fees' }],
    ],
  });
});

test('parseSafeFormattedBlocks handles plain text with newlines and strips unsafe HTML constructs', () => {
  const plainBlocks = parseSafeFormattedBlocks(
    'Line one\nLine two\n\nSecond paragraph',
  );
  assert.deepEqual(plainBlocks, [
    {
      type: 'paragraph',
      inlines: [
        { type: 'text', text: 'Line one' },
        { type: 'br' },
        { type: 'text', text: 'Line two' },
      ],
    },
    {
      type: 'paragraph',
      inlines: [{ type: 'text', text: 'Second paragraph' }],
    },
  ]);

  const malicious =
    '<p>Safe notice</p><script>alert(1)</script><svg onload=alert(2)><img src=x onerror=alert(3)>';
  const stripped = parseSafeFormattedBlocks(malicious);
  assert.deepEqual(stripped, [
    {
      type: 'paragraph',
      inlines: [{ type: 'text', text: 'Safe notice' }],
    },
  ]);
});
