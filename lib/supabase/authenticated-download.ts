import { supabase } from "@/lib/supabase/client";

type ApiError = {
    error?: string;
};

function responseFilename(response: Response) {
    const disposition = response.headers.get("Content-Disposition") || "";
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

    const basicMatch = disposition.match(/filename="?([^";]+)"?/i);
    return basicMatch?.[1] || "download";
}

export async function downloadAuthenticatedFile(path: string) {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;

    if (sessionError || !accessToken) {
        throw new Error("Sign in with your Supabase account to export attendees.");
    }

    const response = await fetch(path, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(payload.error || "Unable to export session attendees.");
    }

    const objectUrl = URL.createObjectURL(await response.blob());
    const downloadLink = document.createElement("a");
    downloadLink.href = objectUrl;
    downloadLink.download = responseFilename(response);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
