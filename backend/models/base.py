"""
backend/models/base.py
─────────────────────────────────────────────────────────────────────────────
SQLAlchemy 2.0 declarative base shared by all ORM models.

Using the modern `DeclarativeBase` pattern (not the legacy `declarative_base()`
function) gives us full type-checking via mapped_column() and Mapped[].

All models in this project inherit from `Base`.  Alembic's env.py imports
`Base.metadata` to drive `--autogenerate` migrations.
─────────────────────────────────────────────────────────────────────────────
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    Project-wide SQLAlchemy declarative base.

    Inherit from this class to register a model with Alembic autogenerate:

        class MyModel(Base):
            __tablename__ = "my_table"
            ...
    """
    pass
