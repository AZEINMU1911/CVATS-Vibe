import { v2 as cloudinary } from "cloudinary";

let configured = false;

const ensureServerCreds = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error("CLOUDINARY_SERVER_CREDS_MISSING", {
      hasCloudName: Boolean(CLOUDINARY_CLOUD_NAME),
      hasApiKey: Boolean(CLOUDINARY_API_KEY),
      hasApiSecret: Boolean(CLOUDINARY_API_SECRET),
    });
    throw new Error("CLOUDINARY_SERVER_CREDS_MISSING");
  }
  return { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } as const;
};

export const initCloudinary = () => {
  const creds = ensureServerCreds();
  if (!configured) {
    cloudinary.config({
      cloud_name: creds.CLOUDINARY_CLOUD_NAME,
      api_key: creds.CLOUDINARY_API_KEY,
      api_secret: creds.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
};

export const signedRawUrl = (publicId: string, version?: number | string) => {
  if (!publicId) {
    throw new Error("CLOUDINARY_PUBLIC_ID_MISSING");
  }
  const overrideBase = process.env.CLOUDINARY_SIGNED_URL_BASE;
  if (overrideBase) {
    if (overrideBase.includes("{publicId}")) {
      let template = overrideBase.replace("{publicId}", encodeURIComponent(publicId));
      if (overrideBase.includes("{version}")) {
        const versionValue =
          version !== undefined && version !== null ? encodeURIComponent(String(version)) : "";
        template = template.replace("{version}", versionValue);
      }
      return template;
    }
    try {
      const url = new URL(overrideBase);
      url.searchParams.set("publicId", publicId);
      if (version !== undefined && version !== null) {
        url.searchParams.set("version", String(version));
      }
      return url.toString();
    } catch {
      const query = new URLSearchParams({ publicId });
      if (version !== undefined && version !== null) {
        query.set("version", String(version));
      }
      const hasQuery = overrideBase.includes("?");
      const joiner = hasQuery ? "&" : "?";
      return `${overrideBase}${joiner}${query.toString()}`;
    }
  }
  const cld = initCloudinary();
  const options: Record<string, unknown> = {
    resource_type: "raw",
    type: "authenticated",
    sign_url: true,
    secure: true,
  };
  if (version !== undefined && version !== null) {
    options.version = version;
  }
  return cld.url(publicId, options);
};
