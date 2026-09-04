"use client";

import { getDownloadURL, ref, updateMetadata, uploadString } from "firebase/storage";
import { firebaseConfigured, getFirebaseStorage } from "@/lib/firebase";
import type { CaptureSession } from "@/lib/types";

export async function uploadCapturePhoto(input: {
  dataUrl: string;
  session: CaptureSession;
  mediaId: string;
  faceStatus?: string;
}) {
  const storage = getFirebaseStorage();
  const path = `captureMedia/${input.session.patient_id}/${input.session.id}/${input.mediaId}.jpg`;
  const metadata = {
    customMetadata: {
      patient_id: input.session.patient_id,
      session_id: input.session.id,
      captured_at: new Date().toISOString(),
      consent_photo: String(input.session.consent.photo),
      privacy_level: input.session.privacy_level,
      retention_policy: input.session.retention_policy,
      face_status: input.faceStatus || "not_processed",
      latitude: input.session.location?.latitude ? String(input.session.location.latitude) : "",
      longitude: input.session.location?.longitude ? String(input.session.location.longitude) : "",
      human_location: input.session.location?.human_label || ""
    }
  };

  if (!storage || !firebaseConfigured) {
    return {
      storage_path: undefined,
      media_url: input.dataUrl,
      firebase: false
    };
  }

  const storageRef = ref(storage, path);
  await uploadString(storageRef, input.dataUrl, "data_url", {
    contentType: "image/jpeg",
    ...metadata
  });
  await updateMetadata(storageRef, metadata);
  return {
    storage_path: path,
    media_url: await getDownloadURL(storageRef),
    firebase: true
  };
}
