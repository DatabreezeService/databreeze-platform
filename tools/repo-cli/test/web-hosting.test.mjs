import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (relativePath) => readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

test('CloudFront hosts the Web SPA with bounded caching and secure custom-domain support', () => {
  const main = read('infrastructure/aws/modules/web/main.tf');
  const variables = read('infrastructure/aws/modules/web/variables.tf');
  const outputs = read('infrastructure/aws/modules/web/outputs.tf');

  assert.match(main, /aws_cloudfront_function"\s+"spa_route"/u);
  assert.match(main, /event_type\s*=\s*"viewer-request"/u);
  assert.match(main, /function_arn\s*=\s*aws_cloudfront_function\.spa_route\[0\]\.arn/u);
  assert.match(main, /request\.uri\s*=\s*"\/index\.html"/u);
  assert.doesNotMatch(main, /custom_error_response/u);
  assert.match(main, /aws_cloudfront_cache_policy"\s+"spa"/u);
  assert.match(main, /default_ttl\s*=\s*0/u);
  assert.match(main, /aws_cloudfront_cache_policy"\s+"immutable_assets"/u);
  assert.match(main, /default_ttl\s*=\s*31536000/u);
  assert.match(main, /ordered_cache_behavior\s*\{[\s\S]*path_pattern\s*=\s*"assets\/\*"/u);
  assert.match(main, /aws_cloudfront_response_headers_policy"\s+"security"/u);
  assert.match(main, /strict_transport_security[\s\S]*access_control_max_age_sec\s*=\s*31536000/u);
  assert.match(main, /content_type_options/u);
  assert.match(main, /frame_options[\s\S]*frame_option\s*=\s*"DENY"/u);
  assert.match(main, /content_security_policy[\s\S]*content_security_policy\s*=\s*local\.web_content_security_policy/u);
  assert.match(main, /connect-src 'self'/u);
  assert.match(main, /var\.connect_src_origins/u);
  assert.match(main, /aliases\s*=\s*var\.aliases/u);
  assert.match(main, /acm_certificate_arn\s*=\s*length\(var\.aliases\)\s*>\s*0/u);
  assert.match(
    main,
    /minimum_protocol_version\s*=\s*length\(var\.aliases\)\s*>\s*0\s*\?\s*"TLSv1\.2_2021"/u,
  );
  assert.match(main, /Custom Web aliases require a reviewed us-east-1 ACM certificate ARN/u);

  assert.match(variables, /variable "aliases"/u);
  assert.match(variables, /variable "acm_certificate_arn"/u);
  assert.match(variables, /variable "connect_src_origins"/u);
  assert.match(outputs, /output "distribution_id"/u);
  assert.match(outputs, /output "distribution_arn"/u);
});
