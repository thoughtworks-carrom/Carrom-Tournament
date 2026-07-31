import { motion } from "framer-motion";
import { finalsPhotoUrl, type FinalsPhoto } from "../lib/finals-content";

export function SectionBlock({
  title,
  subtitle,
  children,
  id,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="mb-16 last:mb-0 scroll-mt-24">
      <div className="mb-8">
        <h3 className="font-display text-2xl md:text-3xl font-bold text-tw-ink dark:text-white">
          {title}
        </h3>
        {subtitle ? (
          <p className="text-tw-purple/70 dark:text-slate-400 mt-2">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function PeoplePhotoGrid({
  photos,
  layout = "grid",
}: {
  photos: FinalsPhoto[];
  layout?: "grid" | "row";
}) {
  if (photos.length === 0) {
    return (
      <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-2xl border border-dashed border-tw-purple/20 dark:border-tw-teal/20">
        Photos will appear here once added to the repo.
      </p>
    );
  }

  return (
    <div
      className={
        layout === "row"
          ? "flex flex-nowrap justify-center gap-5 md:gap-6 lg:gap-7 max-w-[82rem] mx-auto overflow-x-auto pb-1"
          : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6"
      }
    >
      {photos.map((photo) => (
        <motion.div
          key={photo.file}
          whileHover={{ scale: 1.02 }}
          className={
            layout === "row"
              ? "flex flex-col items-center text-center shrink-0 w-40 sm:w-44 md:w-48 lg:w-[13.5rem]"
              : "flex flex-col items-center text-center"
          }
        >
          <div className="w-full aspect-square rounded-2xl overflow-hidden glass bg-white/60 dark:bg-slate-800/60 flex items-center justify-center p-3">
            <img
              src={finalsPhotoUrl(photo.file)}
              alt={photo.title ?? "Photo"}
              className="max-w-full max-h-full w-full h-full object-contain"
            />
          </div>
          {photo.title ? (
            <p
              className={
                layout === "row"
                  ? "mt-3 text-sm md:text-base font-semibold text-tw-ink dark:text-white leading-snug"
                  : "mt-3 text-sm font-semibold text-tw-ink dark:text-white leading-snug"
              }
            >
              {photo.title}
            </p>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}
