from marshmallow import Schema, fields

class FrameSchema(Schema):
    id          = fields.Str(dump_only=True)
    lesson_id   = fields.Str(required=True)
    name        = fields.Str(required=True)
    frame_type  = fields.Str()
    order_index = fields.Int()
    content     = fields.Dict()
    notes       = fields.Str(allow_none=True)
    optional    = fields.Bool()
    created_at  = fields.DateTime(dump_only=True)
    updated_at  = fields.DateTime(dump_only=True)

class LessonSchema(Schema):
    id          = fields.Str(dump_only=True)
    module_id   = fields.Str(required=True)
    name        = fields.Str(required=True)
    order_index = fields.Int()
    frames      = fields.List(fields.Nested(FrameSchema), dump_only=True)
    created_at  = fields.DateTime(dump_only=True)
    updated_at  = fields.DateTime(dump_only=True)

class ModuleSchema(Schema):
    id          = fields.Str(dump_only=True)
    course_id   = fields.Str(required=True)
    name        = fields.Str(required=True)
    order_index = fields.Int()
    lessons     = fields.List(fields.Nested(LessonSchema), dump_only=True)
    created_at  = fields.DateTime(dump_only=True)
    updated_at  = fields.DateTime(dump_only=True)

class CourseSchema(Schema):
    id          = fields.Str(dump_only=True)
    project_id  = fields.Str(required=True)
    name        = fields.Str(required=True)
    order_index = fields.Int()
    modules     = fields.List(fields.Nested(ModuleSchema), dump_only=True)
    created_at  = fields.DateTime(dump_only=True)
    updated_at  = fields.DateTime(dump_only=True)

class ProjectSchema(Schema):
    id           = fields.Str(dump_only=True)
    name         = fields.Str(required=True)
    description  = fields.Str()
    gui_shell_id = fields.Str(allow_none=True)
    courses      = fields.List(fields.Nested(CourseSchema), dump_only=True)
    created_at   = fields.DateTime(dump_only=True)
    updated_at   = fields.DateTime(dump_only=True)

class ProjectListSchema(Schema):
    id          = fields.Str(dump_only=True)
    name        = fields.Str()
    description = fields.Str()
    created_at  = fields.DateTime(dump_only=True)
    updated_at  = fields.DateTime(dump_only=True)
