'use strict';

const {
  CORE_PM2_NAMES,
  OPTIONAL_PM2_NAMES,
  LAUNCH_PROFILES,
  getLaunchProfile,
  getServicesByGroup,
} = require('../service_registry');

const target = process.argv[2] || 'harness';

if (target === 'profiles') {
  process.stdout.write(Object.keys(LAUNCH_PROFILES).join(','));
} else if (target === 'core') {
  process.stdout.write(CORE_PM2_NAMES.join(','));
} else if (target === 'optional') {
  process.stdout.write(OPTIONAL_PM2_NAMES.join(','));
} else if (LAUNCH_PROFILES[target]) {
  process.stdout.write(getLaunchProfile(target).join(','));
} else {
  process.stdout.write(getServicesByGroup(target).map(service => service.pm2).join(','));
}
