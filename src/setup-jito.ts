/**
 * setup-jito.ts — Ensure jito-ts gen modules have required stubs
 * Creates the missing google/protobuf/timestamp.js for protobuf well-known type.
 */

import * as fs from 'fs';
import * as path from 'path';

export function ensureJitoStubs(): boolean {
  try {
    const genDir = path.resolve(process.cwd(), 'node_modules/jito-ts/dist/gen/block-engine');
    const stubPath = path.join(genDir, 'google/protobuf/timestamp.js');

    if (fs.existsSync(stubPath)) {
      return true; // already exists
    }

    const googleDir = path.join(genDir, 'google/protobuf');
    fs.mkdirSync(googleDir, { recursive: true });

    const stubContent = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Timestamp = void 0;
var minimal_1 = require("protobufjs/minimal");
function createBaseTimestamp() {
    return { seconds: 0, nanos: 0 };
}
exports.Timestamp = {
    encode: function (message, writer) {
        writer = minimal_1.default.Writer.create();
        if (message.seconds !== 0 && message.seconds != null)
            writer.uint32(8).int64(message.seconds);
        if (message.nanos !== 0 && message.nanos != null)
            writer.uint32(16).int32(message.nanos);
        return writer;
    },
    decode: function (input, length) {
        var reader = input instanceof minimal_1.default.Reader ? input : minimal_1.default.Reader.create(input);
        var end = length === undefined ? reader.len : reader.pos + length;
        var message = createBaseTimestamp();
        while (reader.pos < end) {
            var tag = reader.uint32();
            switch (tag >>> 3) {
                case 1: message.seconds = Number(reader.int64()); break;
                case 2: message.nanos = reader.int32(); break;
                default: reader.skipType(tag & 7); break;
            }
        }
        return message;
    },
    fromJSON: function (object) {
        return { seconds: object.seconds != null ? Number(object.seconds) : 0, nanos: object.nanos != null ? object.nanos : 0 };
    },
    toJSON: function (message) {
        var obj = {};
        if (message.seconds !== 0) obj.seconds = Math.round(message.seconds);
        if (message.nanos !== 0) obj.nanos = Math.round(message.nanos);
        return obj;
    },
    create: function (base) { return exports.Timestamp.fromPartial(base || {}); },
    fromPartial: function (object) {
        var message = createBaseTimestamp();
        message.seconds = object.seconds != null ? object.seconds : 0;
        message.nanos = object.nanos != null ? object.nanos : 0;
        return message;
    },
};
`;

    fs.writeFileSync(stubPath, stubContent, 'utf-8');
    console.log('[SETUP] Created jito-ts timestamp stub at', stubPath);
    return true;
  } catch (e: any) {
    console.warn('[SETUP] Could not create jito-ts stub:', e.message);
    return false;
  }
}
