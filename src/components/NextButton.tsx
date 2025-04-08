'use client';

import { Loader, ArrowRight } from "lucide-react";
import { useFormStatus } from "react-dom";

export default function NextButton() {
    const { pending } = useFormStatus();
    return (
        <button  
        disabled={pending}
        type="submit" className="px-4 py-2 cursor-pointer flex items-center gap-2 bg-green-500 text-white rounded shadow hover:bg-green-600 disabled:bg-gray-500 disabled:cursor-not-allowed transition duration-150 ease-in-out">
            {pending ? <Loader className="animate-spin" /> : <ArrowRight />}
            {pending ? "Working..." : "Next"}
        </button>
    );
}