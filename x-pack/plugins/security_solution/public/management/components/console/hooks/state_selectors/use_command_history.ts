/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useConsoleStore } from '../../components/console_state/console_state';

export const useCommandHistory = () => {
  return useConsoleStore().state.commandHistory;
};
