import { Body, Controller, Get, HttpCode, Module, Param, Post, Req, Res, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { z } from "zod";
import { Requires } from "../access-control/requires.js";
import type { AdminRequest } from "../auth/admin-area.js";
import type { AdminPrincipal } from "../auth/auth.service.js";
import { NotFoundError, UnauthenticatedError } from "../common/errors/api-error.js";
import { ZodValidationPipe } from "../common/validation/zod-validation.pipe.js";
import {
  CreateDocumentRequest,
  PublishRequest,
  RestoreRevisionRequest,
  SaveHomeRequest,
  SaveRevisionRequest,
  Slug,
  type CreateDocumentRequest as CreateBody,
  type PublishRequest as PublishBody,
  type RestoreRevisionRequest as RestoreBody,
  type SaveHomeRequest as SaveHomeBody,
  type SaveRevisionRequest as SaveBody,
} from "./cms.contracts.js";
import { CMS_IMAGE_MAX_BYTES } from "./cms.schema.js";
import { CmsService } from "./cms.service.js";

const IdParam = new ZodValidationPipe(z.uuid("Invalid id."));
const SlugParam = new ZodValidationPipe(Slug);

const signedIn = (request: AdminRequest): AdminPrincipal => {
  if (!request.admin) throw new UnauthenticatedError();
  return request.admin;
};

const sendImage = (response: Response, image: { bytes: Buffer; contentType: string }, cache: string) => {
  response.set({
    "Content-Type": image.contentType,
    "Content-Length": String(image.bytes.length),
    "X-Content-Type-Options": "nosniff",
    // An image never runs as a page of this origin.
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": cache,
  });
  return new StreamableFile(image.bytes);
};

/**
 * /api/admin/cms — Home and Documentation in the admin (admin-desktop.pdf
 * p6–p11; OPS-26/27/28). Reading needs cms.read; saving a revision
 * cms.update; a new document cms.create; publishing, unpublishing, and
 * archiving or restoring a published page cms.publish (checked by the
 * service, which knows whether the page is published).
 */
@Controller("admin/cms")
export class CmsAdminController {
  constructor(private readonly cms: CmsService) {}

  @Get("documents")
  @Requires("cms.read")
  list() {
    return this.cms.list();
  }

  @Post("documents")
  @Requires("cms.create")
  create(@Body(new ZodValidationPipe(CreateDocumentRequest)) body: CreateBody, @Req() request: AdminRequest) {
    return this.cms.create(body, signedIn(request));
  }

  @Get("home")
  @Requires("cms.read")
  async home(@Req() request: AdminRequest) {
    return { home: await this.cms.home(signedIn(request)) };
  }

  @Post("home/revisions")
  @Requires("cms.update")
  saveHome(@Body(new ZodValidationPipe(SaveHomeRequest)) body: SaveHomeBody, @Req() request: AdminRequest) {
    return this.cms.saveHome(body, signedIn(request));
  }

  @Get("documents/:id")
  @Requires("cms.read")
  get(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.cms.get(id, signedIn(request));
  }

  @Post("documents/:id/revisions")
  @Requires("cms.update")
  save(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(SaveRevisionRequest)) body: SaveBody, @Req() request: AdminRequest) {
    return this.cms.save(id, body, signedIn(request));
  }

  @Get("documents/:id/revisions")
  @Requires("cms.read")
  revisions(@Param("id", IdParam) id: string) {
    return this.cms.revisions(id);
  }

  @Get("documents/:id/revisions/:revisionId")
  @Requires("cms.read")
  revision(@Param("id", IdParam) id: string, @Param("revisionId", IdParam) revisionId: string) {
    return this.cms.revision(id, revisionId);
  }

  /** Restore = a new revision with that version's content (ADR 020). */
  @Post("documents/:id/revisions/:revisionId/restore")
  @HttpCode(200)
  @Requires("cms.update")
  restoreRevision(
    @Param("id", IdParam) id: string,
    @Param("revisionId", IdParam) revisionId: string,
    @Body(new ZodValidationPipe(RestoreRevisionRequest)) body: RestoreBody,
    @Req() request: AdminRequest,
  ) {
    return this.cms.restoreRevision(id, revisionId, body.publish, signedIn(request));
  }

  @Post("documents/:id/publish")
  @HttpCode(200)
  @Requires("cms.publish")
  publish(@Param("id", IdParam) id: string, @Body(new ZodValidationPipe(PublishRequest)) body: PublishBody, @Req() request: AdminRequest) {
    return this.cms.publish(id, body.revisionId, signedIn(request));
  }

  @Post("documents/:id/unpublish")
  @HttpCode(200)
  @Requires("cms.publish")
  unpublish(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.cms.unpublish(id, signedIn(request));
  }

  @Post("documents/:id/archive")
  @HttpCode(200)
  @Requires("cms.update")
  archive(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.cms.setArchived(id, true, signedIn(request));
  }

  @Post("documents/:id/restore")
  @HttpCode(200)
  @Requires("cms.update")
  restore(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.cms.setArchived(id, false, signedIn(request));
  }

  @Post("documents/:id/duplicate")
  @Requires("cms.create")
  duplicate(@Param("id", IdParam) id: string, @Req() request: AdminRequest) {
    return this.cms.duplicate(id, signedIn(request));
  }

  /** multipart/form-data, one `file` field; PNG, JPEG, WebP or GIF (checked from the bytes), at most 5 MB. */
  @Post("images")
  @Requires("cms.update")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: CMS_IMAGE_MAX_BYTES + 1, files: 1, fields: 0, parts: 2 } }))
  upload(@UploadedFile() file: { buffer: Buffer; size: number; originalname: string } | undefined, @Req() request: AdminRequest) {
    return this.cms.uploadImage(file, signedIn(request));
  }

  @Get("images/:id")
  @Requires("cms.read")
  async image(@Param("id", IdParam) id: string, @Res({ passthrough: true }) response: Response) {
    return sendImage(response, await this.cms.adminImage(id), "private, no-cache");
  }
}

/**
 * /api/cms — what visitors see: the published Home and Documentation, the
 * published versions of an article, and the images they use. Read-only, no
 * author names. The web server caches these under the `home` and
 * `documentation` tags; the API revalidates them on every publication.
 */
@Controller("cms")
export class CmsPublicController {
  constructor(private readonly cms: CmsService) {}

  @Get("home")
  async home() {
    const home = await this.cms.publicHome();
    if (!home) throw new NotFoundError("Home has no published content yet.");
    return home;
  }

  @Get("documentation")
  async documentation() {
    return { articles: await this.cms.publicArticles() };
  }

  @Get("documentation/:slug/versions")
  async versions(@Param("slug", SlugParam) slug: string) {
    const versions = await this.cms.publicVersions(slug);
    if (!versions) throw new NotFoundError("Article not found.");
    return { versions };
  }

  /** An old slug of a published article: where it lives now (so shared links keep working). */
  @Get("documentation/:slug/current-slug")
  async currentSlug(@Param("slug", SlugParam) slug: string) {
    const current = await this.cms.currentSlug(slug);
    if (!current) throw new NotFoundError("No article had this slug.");
    return { slug: current };
  }

  /** Images of published pages only; immutable (an id always names the same bytes). */
  @Get("images/:id")
  async image(@Param("id", IdParam) id: string, @Res({ passthrough: true }) response: Response) {
    return sendImage(response, await this.cms.publicImage(id), "public, max-age=31536000, immutable");
  }
}

@Module({
  controllers: [CmsAdminController, CmsPublicController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
