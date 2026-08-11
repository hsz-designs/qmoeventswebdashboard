import { supabase } from "@/lib/supabase/client";

type ApiError = {
    error?: string;
};

export async function authenticatedFetch<T>(path: string, options: RequestInit = {}) {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (sessionError || !accessToken) {
        throw new Error("Sign in with your Supabase account to manage events.");
    }

    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const response = await fetch(path, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
            ...(isFormData ? {} : { "Content-Type": "application/json" }),
        },
    });
    const payload = (await response.json().catch(() => ({}))) as T & ApiError;

    if (!response.ok) {
        throw new Error(payload.error || "The request failed.");
    }

    return payload;
}
