import { v2 as translate } from "@google-cloud/translate";

export const translateClient = new translate.Translate();
export const TARGET_LANGUAGE = "en";
