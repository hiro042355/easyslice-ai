import Image from "next/image";

/** Browser-owned preview URLs must not be fetched or transformed by the image optimizer. */
export function UnoptimizedPreviewImage(props: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}) {
  return <Image {...props} alt={props.alt} unoptimized loading="eager" />;
}
