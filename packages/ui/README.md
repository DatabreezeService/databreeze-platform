# Shared React UI

Accessible Web/Desktop React components that consume platform-neutral design tokens. It contains no direct device, filesystem, or API implementation access.

Import components from the versioned `@databreeze/ui/v1` entry point and include `@databreeze/ui/styles/v1` once in the application shell. The initial `Button` preserves native button keyboard behavior and a token-backed visible focus ring. `Status` always renders readable status content plus a decorative icon so meaning never depends on color alone.

The shared styles consume `@databreeze/design-tokens/css/v1`, enforce the 44px control minimum, support forced colors, and remove transition duration when reduced motion is requested. Android does not consume these React components; it consumes the semantically equivalent generated resources from `@databreeze/design-tokens/android/v1` in native Compose components.
