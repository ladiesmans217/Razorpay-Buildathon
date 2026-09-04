"use client";

import Image from "next/image";
import { useState } from "react";
import { Camera, Loader2, Save, Sparkles, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";
import type { PersonProfile, Role, TrustLevel } from "@/lib/types";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";
import { averageEmbeddings, extractFaceEmbedding, fileToImage } from "@/lib/vision/face";

const MAX_PROFILE_IMAGE_SIZE = 520;

export default function EnrollPage() {
  const { state, commit, updatePerson, removePerson } = useCareStore();
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [profilePreview, setProfilePreview] = useState<string>("/samples/rwa.svg");
  const [enrollStatus, setEnrollStatus] = useState("Upload 5-10 clear consented photos to create a real face embedding.");
  const [embeddingLoading, setEmbeddingLoading] = useState(false);
  const [form, setForm] = useState({
    name: "Suresh",
    relation: "student volunteer",
    role: "volunteer" as Role,
    trust_level: "community" as TrustLevel,
    memory_note: "NSS volunteer trained through CareLearn."
  });

  const processPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setEmbeddingLoading(true);
    setEmbedding(null);
    setSampleCount(0);
    try {
      const collected: number[][] = [];
      const firstFile = files[0];
      if (firstFile) setProfilePreview(await fileToDataUrl(firstFile));
      for (const [index, file] of Array.from(files).entries()) {
        setEnrollStatus(`Reading sample ${index + 1} of ${files.length}: ${file.name}`);
        const image = await fileToImage(file);
        const face = await extractFaceEmbedding(image);
        collected.push(face.embedding);
        setSampleCount(collected.length);
      }
      const averaged = averageEmbeddings(collected);
      setEmbedding(averaged);
      setEnrollStatus(`Embedding ready from ${collected.length} consented sample${collected.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setEnrollStatus(error instanceof Error ? error.message : "Could not create embedding. Try brighter front-facing photos.");
    } finally {
      setEmbeddingLoading(false);
    }
  };

  const save = () => {
    const person: PersonProfile = {
      id: uid("person"),
      patient_id: DEMO_PATIENT_ID,
      name: form.name,
      relation: form.relation,
      role: form.role,
      trust_level: form.trust_level,
      profile_photo_url: profilePreview,
      memory_note: form.memory_note,
      allowed_visibility: "care_circle",
      last_seen_at: new Date().toISOString(),
      last_seen_location: "Enrollment desk",
      last_conversation_summary: "New trusted care circle member enrolled with consent.",
      consent_status: "consented",
      face_embedding: embedding || undefined,
      face_embedding_model: embedding ? "@vladmandic/human face.description" : undefined,
      face_samples: embedding ? sampleCount : 0,
      face_embedding_updated_at: embedding ? new Date().toISOString() : undefined
    };
    commit((current) => ({ ...current, people: [person, ...current.people] }), "Trusted person enrolled");
  };

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Enrollment"
        title="Consent-first trusted person setup"
        body="Upload 5-10 clear photos per trusted person. RememberMe stores only an averaged consented face embedding, not a YOLO identity model and not a stranger database."
      />
      <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Add person</p>
          <div className="mt-5 space-y-4">
            <Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
            <Field label="Relation" value={form.relation} onChange={(relation) => setForm({ ...form, relation })} />
            <label className="block text-sm font-bold text-[#746b61]">Role</label>
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })} className="w-full rounded-2xl border border-[#24201c]/10 bg-white/70 p-3 font-semibold outline-none">
              {["family", "neighbour", "asha", "pharmacy", "rwa", "volunteer"].map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <label className="block text-sm font-bold text-[#746b61]">Trust level</label>
            <select value={form.trust_level} onChange={(event) => setForm({ ...form, trust_level: event.target.value as TrustLevel })} className="w-full rounded-2xl border border-[#24201c]/10 bg-white/70 p-3 font-semibold outline-none">
              {["primary", "trusted", "community", "emergency_only"].map((trust) => (
                <option key={trust} value={trust}>{trust}</option>
              ))}
            </select>
            <Field label="Memory note" value={form.memory_note} onChange={(memory_note) => setForm({ ...form, memory_note })} />
            <div className="rounded-[28px] border border-[#24201c]/10 bg-white/52 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#24201c]">Face embedding samples</p>
                  <p className="mt-1 text-xs leading-5 text-[#746b61]">{enrollStatus}</p>
                </div>
                <Badge tone={embedding ? "safe" : "warn"}>{embedding ? `${sampleCount} samples` : "not ready"}</Badge>
              </div>
              {profilePreview !== "/samples/rwa.svg" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profilePreview}
                  alt="Selected trusted person preview"
                  className="mt-4 size-28 rounded-3xl object-cover shadow-lg"
                />
              )}
              <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#24201c]/15 bg-white/70 px-5 py-2.5 text-sm font-semibold transition hover:bg-white">
                {embeddingLoading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                Upload photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => void processPhotos(event.target.files)}
                />
              </label>
              <div className="mt-4 rounded-2xl bg-[#3f4d7a]/8 p-3 text-xs leading-5 text-[#3f4d7a]">
                No bounding boxes, no labels, no YOLO training. Each photo is converted into a descriptor and averaged for this one trusted person.
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-3xl bg-[#6f8b78]/10 p-4 text-sm leading-6 text-[#476353]">
              <input type="checkbox" checked readOnly className="mt-1" />
              Consent recorded for trusted-person recall. Unknown people remain unknown and are not stored.
            </label>
            <Button onClick={save} disabled={embeddingLoading}>
              {embedding ? <Sparkles size={16} /> : <Save size={16} />}
              Save person
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Enrolled care circle</p>
              <h2 className="mt-1 font-display text-3xl">Trusted profiles</h2>
            </div>
            <Badge tone="privacy">face embeddings only</Badge>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {state.people.map((person) => (
              <div key={person.id} className="trust-ring rounded-[28px] bg-white/52 p-4">
                <Image src={person.profile_photo_url} alt={person.name} width={128} height={128} className="size-20 rounded-3xl object-cover" />
                <h3 className="mt-4 font-display text-2xl">{person.name}</h3>
                <p className="text-sm text-[#746b61]">{person.relation}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="indigo">{person.role}</Badge>
                  <Badge tone="safe">{person.consent_status}</Badge>
                </div>
                <p className="mt-3 text-sm leading-5 text-[#746b61]">{person.memory_note}</p>
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#24201c]/6 px-3 py-1 text-xs font-bold text-[#746b61]">
                  <Camera size={13} />
                  {person.face_embedding?.length
                    ? `${person.face_embedding.length}D embedding, ${person.face_samples || 1} sample${person.face_samples === 1 ? "" : "s"}`
                    : "no live embedding yet"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#24201c]/10 bg-white/70 px-3 py-1.5 text-xs font-bold text-[#746b61] transition hover:bg-white">
                    <Upload size={13} />
                    Update photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        updatePerson(person.id, { profile_photo_url: await fileToDataUrl(file) });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center justify-center rounded-full border border-[#bc6f55]/35 bg-[#bc6f55]/10 px-3 py-1.5 text-xs font-bold text-[#8a4634] transition hover:bg-[#bc6f55]/18"
                    onClick={() => {
                      if (window.confirm(`Remove trusted profile “${person.name}”?`)) {
                        removePerson(person.id);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new window.Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read profile image."));
    reader.onload = () => {
      const source = String(reader.result || "");
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, MAX_PROFILE_IMAGE_SIZE / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(source);
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = () => resolve(source);
      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#746b61]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-[#24201c]/10 bg-white/70 p-3 font-semibold outline-none focus:ring-2 focus:ring-[#3f4d7a]/20"
      />
    </label>
  );
}
