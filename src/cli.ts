#!/usr/bin/env node
import { createProgram } from './program';

const program = createProgram();
program.parse(process.argv);
