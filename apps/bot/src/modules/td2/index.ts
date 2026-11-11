import type { ComponentHandler, SlashCommand } from '../../core/command.js';
import { td2 } from './commands/td2.js';
import {
  cancelTd2Button,
  confirmCancelTd2Button,
  directivesTd2Select,
  keepTd2Button,
  manageTd2Button,
  rescheduleTd2Button,
  rescheduleTd2Modal,
} from './manage.js';
import { confirmReportButton, rejectReportButton, reviewReportButton } from './reports/review.js';
import { joinTd2Button, leaveTd2Button } from './signup.js';

export { createTd2Processor } from './processor.js';
export { removeReportStaffMessage } from './reports/remove.js';
export { resumeTd2Events } from './resume.js';
export { createTd2Stats } from './stats/index.js';

export const td2Commands: SlashCommand[] = [td2];

export const td2Components: ComponentHandler[] = [
  joinTd2Button,
  leaveTd2Button,
  manageTd2Button,
  rescheduleTd2Button,
  rescheduleTd2Modal,
  cancelTd2Button,
  confirmCancelTd2Button,
  keepTd2Button,
  directivesTd2Select,
  reviewReportButton,
  confirmReportButton,
  rejectReportButton,
];
