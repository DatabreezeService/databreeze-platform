import assert from 'node:assert/strict';
import test from 'node:test';

import { balancedBlocks } from '../src/terraform-safety.mjs';

test('Terraform block scanning ignores comments, heredocs, and braces in strings', () => {
  const source = `
# ingress { cidr_blocks = ["0.0.0.0/0"] }
/* ingress { cidr_blocks = ["0.0.0.0/0"] } */
locals {
  description = <<-EOT
    ingress {
      cidr_blocks = ["0.0.0.0/0"]
    }
    braces: { };
  EOT
}
ingress {
  description = "literal } brace"
  ${' '.repeat(500)}
  cidr_blocks = ["10.0.0.0/8"]
}
`;
  const blocks = balancedBlocks(source, 'ingress');
  assert.equal(blocks.length, 1);
  assert.match(blocks[0], /10\.0\.0\.0\/8/u);
  assert.doesNotMatch(blocks[0], /0\.0\.0\.0\/0/u);
});

test('Terraform principal scanning ignores commented wildcard identifiers', () => {
  const source = `
/* principals { identifiers = ["*"] } */
principals {
  type = "Service"
  identifiers = ["example.amazonaws.com"]
}
`;
  const blocks = balancedBlocks(source, 'principals');
  assert.equal(blocks.length, 1);
  assert.doesNotMatch(blocks[0], /identifiers\s*=\s*\[[^\]]*"\*"/u);
});
