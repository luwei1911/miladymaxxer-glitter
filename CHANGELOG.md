# Changelog

All notable changes to Miladymaxxer will be documented in this file.

## [0.2.4] - 2026-03-27

### Added
- Sound toggle in Settings tab
- Silver metallic effect for milady posts with 0 likes (encourage engagement)
- Enhanced gold effect (20% more gold) for posts user has liked
- Quote tweet detection - gold styling when a milady is quoted
- Extension icon using milady logo
- Milady quote tweets get gold cards, non-milady quotes get neutral background
- Hide dislike/downvote button on milady posts

### Changed
- Unified gold/silver styling across light and dark modes (fully opaque cards)
- Renamed "Filter" tab to "Settings"
- Improved follow detection (shows underline by default for miladys you might not follow)
- Removed dim mode support (Twitter discontinued dim mode)

### Fixed
- Avatar detection now picks largest image to avoid capturing badge overlays
- Reply fade-in effect only applies in actual threads, not adjacent timeline posts

## [0.2.3] - 2026-03-27

### Added
- Gold shimmery "Follow back" button for miladys who follow you
- Silver "Follow" button for miladys who don't follow you
- Milady detection in "Who to follow" section and user cells
- Faded pink heart on milady posts (brightens on hover to encourage engagement)
- Light grey underline on handle for miladys you don't follow

### Changed
- Renamed from milady-shrinkifier to miladymaxxer
- Toned down gold highlighting in dark mode for better visibility
- Updated all data attributes to use `miladymaxxer` prefix

### Fixed
- Dark mode gold effects now less intense and more subtle

## [0.2.2] - 2025-03-26

### Added
- Sound effects system with polyphonic playback
- Milady logo replacement on avatars
- Gold metallic visual effects for milady mode
- Seamless card styling for milady replies

### Changed
- Redesigned popup with Linear-inspired metallic gold theme
- Default mode changed from 'off' to 'milady'

### Fixed
- Mode selector clipping in popup
- Extension manifest version sync
- Milady mode validation in storage

## [0.2.1] - 2025-03-25

### Added
- GitHub release workflow
- Improved classifier model

### Changed
- Updated terminology (exempt over whitelist)
- Consolidated readme documentation

## [0.2.0] - 2025-03-24

### Added
- Initial milady detection using on-device ONNX model
- Three modes: milady (elevate), shrink (diminish non-miladys), off
- Avatar export functionality
- Popup interface for mode selection
